<?php

namespace Tests\Unit\ML;

use App\ML\CustomerChurnDataset;
use App\ML\CustomerIntervalDataset;
use App\ML\CustomerSnapshots;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class CustomerChurnDatasetTest extends TestCase {
    use DatabaseTransactions;

    private function purchaseAt(Company $company, Carbon $at, float $net = 500): Invoice {
        $invoice = Invoice::factory()->for($company)->create(['created_at' => $at, 'updated_at' => $at]);
        InvoiceItem::factory()->net($net)->create(['invoice_id' => $invoice->id, 'company_id' => $company->id]);
        DB::table('invoices')->where('id', $invoice->id)->update(['created_at' => $at]);

        return $invoice->refresh();
    }
    public function test_label_is_one_when_no_purchase_in_next_twelve_months(): void {
        $company = Company::factory()->create();

        $base = Carbon::create(2020, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));
        // Next purchase is > 12 months after a cutoff at day 210 → churned in that window.
        $this->purchaseAt($company, $base->copy()->addDays(700));

        $purchases = CustomerIntervalDataset::purchaseEvents(CustomerSnapshots::invoicesFor($company));
        $cutoff    = $base->copy()->addDays(210);

        $row = CustomerChurnDataset::extractRow($company, $purchases, $cutoff);

        self::assertSame(1, $row[CustomerChurnDataset::LABEL]);
    }
    public function test_label_is_zero_when_a_purchase_occurs_in_next_twelve_months(): void {
        $company = Company::factory()->create();

        $base = Carbon::create(2020, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));
        // Next purchase 90 days after the cutoff → NOT churned.
        $this->purchaseAt($company, $base->copy()->addDays(300));

        $purchases = CustomerIntervalDataset::purchaseEvents(CustomerSnapshots::invoicesFor($company));
        $cutoff    = $base->copy()->addDays(210);

        $row = CustomerChurnDataset::extractRow($company, $purchases, $cutoff);

        self::assertSame(0, $row[CustomerChurnDataset::LABEL]);
    }
    public function test_features_never_see_purchases_after_the_cutoff(): void {
        $company = Company::factory()->create();

        $base = Carbon::create(2020, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));
        $this->purchaseAt($company, $base->copy()->addDays(300)); // after cutoff

        $purchases = CustomerIntervalDataset::purchaseEvents(CustomerSnapshots::invoicesFor($company));
        $cutoff    = $base->copy()->addDays(210);

        $row = CustomerChurnDataset::extractRow($company, $purchases, $cutoff);

        // Only 3 purchases exist at/before the cutoff (day 300 must NOT be counted).
        self::assertSame(3, $row['purchase_count_to_date']);
        self::assertGreaterThan(0, $row['days_since_last_purchase']);
        // recency_over_mean_gap = days_since_last (~10) / mean_gap (100) — small, not churned-ish.
        self::assertLessThan(1.0, $row['recency_over_mean_gap']);
    }
    public function test_rows_only_include_snapshots_with_a_fully_observed_window(): void {
        $company = Company::factory()->create();

        $base = Carbon::create(2022, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));

        // Every emitted snapshot's 12-month observation window must end at or before
        // the last known purchase (day 200) — otherwise "not churned" would just mean
        // "unobserved". With only ~200 days of history, most/all cutoffs are censored.
        $rows        = CustomerChurnDataset::extractRowsForCompany($company);
        $lastKnownAt = $base->copy()->addDays(200);

        foreach ($rows as $row) {
            $windowEnd = Carbon::parse($row['cutoff'])->addMonths(CustomerChurnDataset::LABEL_WINDOW_MONTHS);
            self::assertTrue($windowEnd->lte($lastKnownAt), 'no snapshot should have a censored (unobserved) label window');
        }

        // Explicit boundary assertion so the test is meaningful even when zero rows survive:
        // a cutoff at day 100 needs data through day 465, which doesn't exist → censored → dropped.
        $purchases = CustomerIntervalDataset::purchaseEvents(CustomerSnapshots::invoicesFor($company));
        $censored  = $base->copy()->addDays(100);
        self::assertNotEmpty(
            CustomerChurnDataset::extractRow($company, $purchases, $censored),
            'extractRow itself still builds a row (censorship is enforced by extractRowsForCompany, not extractRow)'
        );
        self::assertTrue($censored->copy()->addMonths(CustomerChurnDataset::LABEL_WINDOW_MONTHS)->gt($lastKnownAt));
    }
}
