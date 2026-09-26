<?php

namespace Tests\Unit\ML;

use App\Enums\InvoiceItemType;
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
class CustomerIntervalDatasetTest extends TestCase {
    use DatabaseTransactions;

    /** A "purchase event" invoice — has a Default (non-repeating) item. */
    private function purchaseAt(Company $company, Carbon $at, float $net = 500): Invoice {
        $invoice = Invoice::factory()->for($company)->create(['created_at' => $at, 'updated_at' => $at]);
        InvoiceItem::factory()->net($net)->create(['invoice_id' => $invoice->id, 'company_id' => $company->id]);
        DB::table('invoices')->where('id', $invoice->id)->update(['created_at' => $at]);

        return $invoice->refresh();
    }

    /** A repeating-only invoice — must be EXCLUDED from purchase events. */
    private function repeatingOnlyAt(Company $company, Carbon $at): Invoice {
        $invoice = Invoice::factory()->for($company)->create(['created_at' => $at, 'updated_at' => $at]);
        InvoiceItem::factory()->ofType(InvoiceItemType::Monthly)->create(['invoice_id' => $invoice->id, 'company_id' => $company->id]);
        DB::table('invoices')->where('id', $invoice->id)->update(['created_at' => $at]);

        return $invoice->refresh();
    }

    public function test_purchase_events_exclude_repeating_only_invoices(): void {
        $company = Company::factory()->create();

        $this->purchaseAt($company, Carbon::create(2022, 1, 1));
        $this->repeatingOnlyAt($company, Carbon::create(2022, 2, 1)); // must be excluded
        $this->purchaseAt($company, Carbon::create(2022, 3, 1));

        $invoices  = CustomerSnapshots::invoicesFor($company);
        $purchases = CustomerIntervalDataset::purchaseEvents($invoices);

        self::assertCount(2, $purchases, 'the repeating-only invoice must be excluded from purchase events');
    }
    public function test_features_use_only_purchases_before_cutoff_and_label_is_the_next_gap(): void {
        $company = Company::factory()->create();

        // Purchases at day 0, +100, +200 (before cutoff); next purchase at +330 (after cutoff).
        $base = Carbon::create(2022, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));
        $this->purchaseAt($company, $base->copy()->addDays(330)); // the observable "next" purchase

        $invoices  = CustomerSnapshots::invoicesFor($company);
        $purchases = CustomerIntervalDataset::purchaseEvents($invoices);
        $cutoff    = $base->copy()->addDays(250); // sits between the 200 and 330 purchases

        $row = CustomerIntervalDataset::extractRow($company, $purchases, $cutoff);

        self::assertNotNull($row);
        // Prior gaps are 100 and 100 → mean 100, last gap 100.
        self::assertEqualsWithDelta(100.0, $row['mean_gap_days'], 0.5);
        self::assertEqualsWithDelta(100.0, $row['last_gap_days'], 0.5);
        self::assertSame(3, $row['purchase_count_to_date']);
        // Label = gap from last pre-cutoff purchase (day 200) to next purchase (day 330) = 130 days.
        self::assertEqualsWithDelta(130.0, $row[CustomerIntervalDataset::LABEL], 0.5);
    }
    public function test_extract_row_is_null_without_an_observable_next_purchase(): void {
        $company = Company::factory()->create();

        $base = Carbon::create(2022, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));

        $invoices  = CustomerSnapshots::invoicesFor($company);
        $purchases = CustomerIntervalDataset::purchaseEvents($invoices);
        // Cutoff AFTER the last purchase → no observable next purchase → null.
        $cutoff = $base->copy()->addDays(300);

        self::assertNull(CustomerIntervalDataset::extractRow($company, $purchases, $cutoff));
    }
    public function test_days_since_last_purchase_and_tenure_are_positive(): void {
        $company = Company::factory()->create();

        $base = Carbon::create(2022, 1, 1);
        $this->purchaseAt($company, $base->copy());
        $this->purchaseAt($company, $base->copy()->addDays(100));
        $this->purchaseAt($company, $base->copy()->addDays(200));
        $this->purchaseAt($company, $base->copy()->addDays(330));

        $invoices  = CustomerSnapshots::invoicesFor($company);
        $purchases = CustomerIntervalDataset::purchaseEvents($invoices);
        $cutoff    = $base->copy()->addDays(250);

        $row = CustomerIntervalDataset::extractRow($company, $purchases, $cutoff);

        self::assertGreaterThan(0, $row['days_since_last_purchase']);
        self::assertGreaterThan(0, $row['tenure_days']);
    }
}
