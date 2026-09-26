<?php

namespace Tests\Unit\ML;

use App\ML\CustomerRevenueDataset;
use App\ML\CustomerSnapshots;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class CustomerRevenueDatasetTest extends TestCase {
    use DatabaseTransactions;

    /** Create a non-cancelled invoice with a single Default item of the given net, dated at $at. */
    private function invoiceAt(Company $company, Carbon $at, float $net): Invoice {
        $invoice = Invoice::factory()->for($company)->create(['created_at' => $at, 'updated_at' => $at]);
        InvoiceItem::factory()->net($net)->create(['invoice_id' => $invoice->id, 'company_id' => $company->id]);
        // Force created_at again — precompute/touch side effects can bump it.
        DB::table('invoices')->where('id', $invoice->id)->update(['created_at' => $at, 'net' => null]);

        return $invoice->refresh();
    }

    public function test_features_never_see_invoices_after_the_cutoff(): void {
        $company = Company::factory()->create();

        // Pre-cutoff invoices (features may see these).
        $this->invoiceAt($company, Carbon::create(2022, 1, 15), 1000);
        $this->invoiceAt($company, Carbon::create(2022, 6, 15), 2000);
        // Post-cutoff invoice inside the label window (label may see this, features must NOT).
        $this->invoiceAt($company, Carbon::create(2023, 3, 15), 9999);
        // A far-future invoice so the 12-month label window is fully present in the data.
        $this->invoiceAt($company, Carbon::create(2024, 6, 15), 500);

        $invoices = CustomerSnapshots::invoicesFor($company);
        $cutoff   = Carbon::create(2022, 12, 31)->endOfMonth();

        $row = CustomerRevenueDataset::extractRow($company, $invoices, $cutoff);

        // lifetime revenue to cutoff = 1000 + 2000 = 3000 (the 9999 must NOT leak into features).
        self::assertEqualsWithDelta(3000.0, $row['lifetime_revenue_to_date'], 0.01);
        self::assertSame(2, $row['invoice_count_to_date']);
        // The label (next 12 months) DOES include the 9999 post-cutoff invoice.
        self::assertEqualsWithDelta(9999.0, $row[CustomerRevenueDataset::LABEL], 0.01);
    }
    public function test_label_window_is_exactly_the_next_twelve_months(): void {
        $company = Company::factory()->create();

        $this->invoiceAt($company, Carbon::create(2021, 1, 15), 500);
        $this->invoiceAt($company, Carbon::create(2021, 6, 15), 500);
        // In-window (within 12 months after a 2021-12-31 cutoff):
        $this->invoiceAt($company, Carbon::create(2022, 3, 15), 1000);
        $this->invoiceAt($company, Carbon::create(2022, 11, 15), 2000);
        // Out-of-window (more than 12 months after cutoff): must NOT count toward the label.
        $this->invoiceAt($company, Carbon::create(2023, 6, 15), 8000);

        $invoices = CustomerSnapshots::invoicesFor($company);
        $cutoff   = Carbon::create(2021, 12, 31)->endOfMonth();

        $row = CustomerRevenueDataset::extractRow($company, $invoices, $cutoff);

        self::assertEqualsWithDelta(3000.0, $row[CustomerRevenueDataset::LABEL], 0.01);
    }
    public function test_tenure_and_days_since_last_invoice_are_positive(): void {
        $company = Company::factory()->create();

        $this->invoiceAt($company, Carbon::create(2020, 1, 1), 500);
        $this->invoiceAt($company, Carbon::create(2021, 1, 1), 500);
        $this->invoiceAt($company, Carbon::create(2023, 1, 1), 500); // ensures label window is present

        $invoices = CustomerSnapshots::invoicesFor($company);
        $cutoff   = Carbon::create(2021, 6, 30)->endOfMonth();

        $row = CustomerRevenueDataset::extractRow($company, $invoices, $cutoff);

        self::assertGreaterThan(0, $row['tenure_days']);
        self::assertGreaterThan(0, $row['days_since_last_invoice']);
    }
    public function test_eligible_companies_exclude_me_id_and_deprecated(): void {
        $meId = (int)Param::get('ME_ID')->value;

        $normal = Company::factory()->create(['is_deprecated' => false]);
        $this->invoiceAt($normal, Carbon::create(2022, 1, 1), 500);
        $this->invoiceAt($normal, Carbon::create(2022, 6, 1), 500);

        $deprecated = Company::factory()->create(['is_deprecated' => true]);
        $this->invoiceAt($deprecated, Carbon::create(2022, 1, 1), 500);
        $this->invoiceAt($deprecated, Carbon::create(2022, 6, 1), 500);

        $eligibleIds = CustomerRevenueDataset::eligibleCompanies()->pluck('id');

        self::assertTrue($eligibleIds->contains($normal->id));
        self::assertFalse($eligibleIds->contains($deprecated->id));
        self::assertFalse($eligibleIds->contains($meId));
    }
}
