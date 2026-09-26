<?php

namespace Tests\Unit\ML;

use App\ML\CustomerSnapshots;
use App\ML\SupportLoadDataset;
use App\Models\Company;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class SupportLoadDatasetTest extends TestCase {
    use DatabaseTransactions;

    /** Create a support focus (parent_type=Company) at $at with the given duration. */
    private function focusAt(Company $company, Carbon $at, float $duration, ?string $invoiceItemId = null): Focus {
        return Focus::factory()->forParent($company)->create([
            'started_at'      => $at,
            'duration'        => $duration,
            'invoice_item_id' => $invoiceItemId,
        ]);
    }

    private function invoiceAt(Company $company, Carbon $at, float $net): void {
        $invoice = Invoice::factory()->for($company)->create(['created_at' => $at, 'updated_at' => $at]);
        InvoiceItem::factory()->net($net)->create(['invoice_id' => $invoice->id, 'company_id' => $company->id]);
        DB::table('invoices')->where('id', $invoice->id)->update(['created_at' => $at, 'net' => null]);
    }
    public function test_features_never_see_support_foci_after_the_cutoff(): void {
        $company = Company::factory()->create();

        // Pre-cutoff foci (features may see these).
        $this->focusAt($company, Carbon::create(2022, 1, 10), 2.0);
        $this->focusAt($company, Carbon::create(2022, 1, 20), 3.0);
        // In-window post-cutoff foci (label may see, features must NOT).
        $this->focusAt($company, Carbon::create(2022, 2, 15), 5.0);
        $this->focusAt($company, Carbon::create(2022, 4, 20), 4.0);
        // Out-of-window (more than WINDOW_MONTHS=3 after cutoff), also ensures the label
        // window is fully present in the data.
        $this->focusAt($company, Carbon::create(2022, 5, 15), 99.0);

        $foci     = CustomerSnapshots::fociFor($company);
        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();
        $cutoff   = Carbon::create(2022, 1, 31)->endOfMonth();

        $row = SupportLoadDataset::extractRow($company, $foci, $invoices, $projects, $cutoff);

        // lifetime support hours to cutoff = 2 + 3 = 5 (the post-cutoff foci must NOT leak into features).
        self::assertEqualsWithDelta(5.0, $row['lifetime_support_hours'], 0.01);
        self::assertEqualsWithDelta(5.0, $row['trailing_3m_support_hours'], 0.01);
        // The label (next WINDOW_MONTHS=3 months) includes the 5.0 and 4.0 in-window foci, NOT the 99.0.
        self::assertEqualsWithDelta(9.0, $row[SupportLoadDataset::LABEL], 0.01);
    }
    public function test_label_window_is_exactly_the_next_quarter(): void {
        $company = Company::factory()->create();

        $this->focusAt($company, Carbon::create(2021, 1, 10), 1.0);
        $this->focusAt($company, Carbon::create(2021, 1, 20), 1.0);
        // In-window (within 3 months after a 2021-01-31 cutoff, i.e. up to 2021-04-30):
        $this->focusAt($company, Carbon::create(2021, 2, 15), 2.0);
        $this->focusAt($company, Carbon::create(2021, 4, 30), 3.0);
        // Out-of-window (after 2021-04-30): must NOT count toward the label.
        $this->focusAt($company, Carbon::create(2021, 5, 1), 50.0);

        $foci     = CustomerSnapshots::fociFor($company);
        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();
        $cutoff   = Carbon::create(2021, 1, 31)->endOfMonth();

        $row = SupportLoadDataset::extractRow($company, $foci, $invoices, $projects, $cutoff);

        self::assertEqualsWithDelta(5.0, $row[SupportLoadDataset::LABEL], 0.01);
    }
    public function test_tenure_and_days_since_last_support_are_positive(): void {
        $company = Company::factory()->create();

        $this->focusAt($company, Carbon::create(2020, 1, 1), 1.0);
        $this->focusAt($company, Carbon::create(2021, 1, 1), 1.0);
        $this->focusAt($company, Carbon::create(2021, 9, 30), 1.0); // ensures label window is present

        $foci     = CustomerSnapshots::fociFor($company);
        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();
        $cutoff   = Carbon::create(2021, 6, 30)->endOfMonth();

        $row = SupportLoadDataset::extractRow($company, $foci, $invoices, $projects, $cutoff);

        self::assertGreaterThan(0, $row['tenure_days']);
        self::assertGreaterThan(0, $row['days_since_last_support']);
    }
    public function test_eligible_companies_exclude_me_id_and_deprecated(): void {
        $meId = (int)Param::get('ME_ID')->value;

        $normal = Company::factory()->create(['is_deprecated' => false]);
        $this->focusAt($normal, Carbon::create(2022, 1, 1), 1.0);
        $this->focusAt($normal, Carbon::create(2022, 2, 1), 1.0);

        $deprecated = Company::factory()->create(['is_deprecated' => true]);
        $this->focusAt($deprecated, Carbon::create(2022, 1, 1), 1.0);
        $this->focusAt($deprecated, Carbon::create(2022, 2, 1), 1.0);

        $eligibleIds = SupportLoadDataset::eligibleCompanies()->pluck('id');

        self::assertTrue($eligibleIds->contains($normal->id));
        self::assertFalse($eligibleIds->contains($deprecated->id));
        self::assertFalse($eligibleIds->contains($meId));
    }
    public function test_support_ticket_count_groups_by_invoice_item_not_raw_entries(): void {
        $company = Company::factory()->create();
        $item    = InvoiceItem::factory()->net(100)->create(['company_id' => $company->id]);

        $this->focusAt($company, Carbon::create(2022, 1, 5), 1.0);
        $this->focusAt($company, Carbon::create(2022, 1, 10), 1.0);
        // Two foci logged against the SAME invoice item = one ticket.
        $this->focusAt($company, Carbon::create(2022, 1, 15), 1.0, $item->id);
        $this->focusAt($company, Carbon::create(2022, 1, 16), 1.0, $item->id);
        // A far-future focus so the label window is fully present.
        $this->focusAt($company, Carbon::create(2022, 6, 1), 1.0);

        $foci     = CustomerSnapshots::fociFor($company);
        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();
        $cutoff   = Carbon::create(2022, 1, 31)->endOfMonth();

        $row = SupportLoadDataset::extractRow($company, $foci, $invoices, $projects, $cutoff);

        // 2 standalone foci (no invoice item) + 1 grouped pair sharing the same item = 3 tickets.
        self::assertSame(3, $row['support_ticket_count_trailing_12m']);
    }
    public function test_active_project_count_at_cutoff_excludes_projects_finished_before_cutoff(): void {
        $company = Company::factory()->create();

        $this->focusAt($company, Carbon::create(2022, 1, 1), 1.0);
        $this->focusAt($company, Carbon::create(2022, 2, 1), 1.0);
        $this->focusAt($company, Carbon::create(2022, 6, 1), 1.0); // ensures label window is present

        $stillOpen = Project::factory()->create(['company_id' => $company->id, 'created_at' => Carbon::create(2022, 1, 1)]);

        $finished = Project::factory()->finished()->create(['company_id' => $company->id, 'created_at' => Carbon::create(2022, 1, 1)]);
        // Force the Finished state's pivot row to be BEFORE the cutoff.
        DB::table('project_project_state')
            ->where('project_id', $finished->id)
            ->where('project_state_id', '!=', 1)
            ->update(['created_at' => Carbon::create(2022, 1, 15)]);

        $notYetExisting = Project::factory()->create(['company_id' => $company->id, 'created_at' => Carbon::create(2022, 3, 1)]);

        $foci     = CustomerSnapshots::fociFor($company);
        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();
        $cutoff   = Carbon::create(2022, 1, 31)->endOfMonth();

        $row = SupportLoadDataset::extractRow($company, $foci, $invoices, $projects, $cutoff);

        // Only $stillOpen existed by the cutoff and wasn't finished by then.
        self::assertSame(1, $row['active_project_count_at_cutoff']);
    }
}
