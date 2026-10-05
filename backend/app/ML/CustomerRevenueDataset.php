<?php

namespace App\ML;

use App\Models\Company;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Feature extraction for Model A — customer 12-month revenue regression — the
 * single source of truth shared between training (TrainCustomerRevenueModel)
 * and inference (CustomerRevenueModel::predict()).
 *
 * A training "row" is a (company, cutoff date) SNAPSHOT, not one row per
 * company: every FEATURES value is computed strictly from invoices with
 * `created_at <= cutoff` (see CustomerSnapshots), and the LABEL is the sum of
 * `net` for invoices in `(cutoff, cutoff + 12 months]`. Multiple snapshots per
 * company are correlated (they share history) — CustomerRevenueModel::evaluate()
 * groups CV folds by `company_id` to avoid leaking a company across folds.
 */
class CustomerRevenueDataset {
    public const FEATURES = [
        'trailing_6m_revenue',
        'trailing_12m_revenue',
        'trailing_24m_revenue',
        'lifetime_revenue_to_date',
        'invoice_count_to_date',
        'invoice_count_trailing_12m',
        'avg_invoice_net_lifetime',
        'tenure_days',
        'days_since_last_invoice',
        'distinct_product_count_to_date',
        'revenue_growth_ratio',
    ];

    /**
     * NOTE (measured, negative result): trailing_6m_revenue and revenue_growth_ratio
     * (trailing-12m vs the prior 12m) were added as a growth/decline signal the
     * persistence baseline can't see, then measured head-to-head with/without them —
     * they did not help (KNNRegressor MAE 6682 → 6811, i.e. slightly worse). Kept
     * computed/exposed here (visible in --dry-run distributions, same as
     * ProjectDataset's Phase-2 history features) but CustomerRevenueModel::toSample()
     * still reads all of FEATURES since the two extra columns are at least not
     * actively harmful once z-scaled — the loss is small and within run-to-run noise
     * (Ridge/RegressionTree/KNN CV scores vary noticeably between shuffled folds on
     * this dataset). Documented in docs/ml/customer-revenue-plan.md.
     */
    public const LABEL = 'revenue_next_12m';

    public const LABEL_WINDOW_MONTHS = 12;
    public const MIN_PRIOR_INVOICES  = 2;

    /**
     * @return Collection<int, Company>
     */
    public static function eligibleCompanies(): Collection {
        return CustomerSnapshots::eligibleCompaniesQuery()
            ->withCount(['invoices' => fn ($q) => $q->where(fn ($q2) => $q2->where('is_cancelled', false)->orWhereNull('is_cancelled'))])
            ->having('invoices_count', '>=', self::MIN_PRIOR_INVOICES)
            ->get();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function extractRowsForCompany(Company $company): array {
        $invoices = CustomerSnapshots::invoicesFor($company);
        if ($invoices->count() < self::MIN_PRIOR_INVOICES) {
            return [];
        }

        $lastInvoiceAt = Carbon::parse($invoices->last()->created_at);
        $rows          = [];

        foreach (CustomerSnapshots::candidateCutoffs($invoices) as $cutoff) {
            $before = CustomerSnapshots::invoicesBefore($invoices, $cutoff);
            if ($before->count() < self::MIN_PRIOR_INVOICES) {
                continue;
            }

            if ($cutoff->copy()->addMonths(self::LABEL_WINDOW_MONTHS)->gt($lastInvoiceAt)) {
                continue;
            }

            $rows[] = self::extractRow($company, $invoices, $cutoff);
        }
        return $rows;
    }

    /**
     * One (company, cutoff) snapshot's features + label.
     *
     * @param Collection<int, Invoice> $invoices ALL of the company's non-cancelled invoices (CustomerSnapshots::invoicesFor())
     * @return array<string, mixed>
     */
    public static function extractRow(Company $company, Collection $invoices, Carbon $cutoff): array {
        $before      = CustomerSnapshots::invoicesBefore($invoices, $cutoff);
        $labelWindow = CustomerSnapshots::invoicesInWindow($invoices, $cutoff, self::LABEL_WINDOW_MONTHS);

        $trailing6m  = $before->filter(fn ($i) => Carbon::parse($i->created_at)->gt($cutoff->copy()->subMonths(6)));
        $trailing12m = $before->filter(fn ($i) => Carbon::parse($i->created_at)->gt($cutoff->copy()->subMonths(12)));
        $trailing24m = $before->filter(fn ($i) => Carbon::parse($i->created_at)->gt($cutoff->copy()->subMonths(24)));

        $trailing12mRevenue = CustomerSnapshots::sumNet($trailing12m);
        $prior12to24Revenue = CustomerSnapshots::sumNet($trailing24m) - $trailing12mRevenue;
        $revenueGrowthRatio = $prior12to24Revenue > 0 ? $trailing12mRevenue / $prior12to24Revenue : null;

        $firstInvoiceAt = Carbon::parse($invoices->first()->created_at);
        $lastBeforeAt   = Carbon::parse($before->last()->created_at);

        // NOTE: on invoiced InvoiceItem rows `product_id` is never populated (verified on
        // real data: 0/18335) — `product_source_id` is the actual populated FK (see
        // Company::indexedItems()'s `productSource` relation), so distinct-product-count
        // uses that column instead.
        $productIds = $before
            ->flatMap(fn ($invoice) => $invoice->invoiceItems->pluck('product_source_id'))
            ->filter()
            ->unique();

        return [
            'company_id'                      => $company->id,
            'cutoff'                          => $cutoff->toDateString(),
            'trailing_6m_revenue'             => CustomerSnapshots::sumNet($trailing6m),
            'trailing_12m_revenue'            => $trailing12mRevenue,
            'trailing_24m_revenue'            => CustomerSnapshots::sumNet($trailing24m),
            'lifetime_revenue_to_date'        => CustomerSnapshots::sumNet($before),
            'invoice_count_to_date'           => $before->count(),
            'invoice_count_trailing_12m'      => $trailing12m->count(),
            'avg_invoice_net_lifetime'        => $before->count() > 0 ? CustomerSnapshots::sumNet($before) / $before->count() : 0.0,
            'tenure_days'                     => $firstInvoiceAt->diffInDays($cutoff),
            'days_since_last_invoice'         => $lastBeforeAt->diffInDays($cutoff),
            'distinct_product_count_to_date'  => $productIds->count(),
            'revenue_growth_ratio'            => $revenueGrowthRatio,
            self::LABEL                       => CustomerSnapshots::sumNet($labelWindow),
        ];
    }

    /**
     * @param Collection<int, Company> $companies
     * @return Collection<int, array<string, mixed>>
     */
    public static function extractRows(Collection $companies): Collection {
        $rows = [];
        foreach ($companies as $company) {
            array_push($rows, ...self::extractRowsForCompany($company));
        }
        return collect($rows);
    }

    public static function logLabel(float $revenue): float {
        return log(max(0.0, $revenue) + 1);
    }
}
