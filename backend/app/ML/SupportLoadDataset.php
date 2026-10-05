<?php

namespace App\ML;

use App\Models\Company;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\ProjectState;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Feature extraction for the support-load forecast — the single source of
 * truth shared between training (TrainSupportLoadModel) and inference
 * (SupportLoadModel::predict()).
 *
 * A training "row" is a (company, cutoff date) SNAPSHOT, exactly like
 * CustomerRevenueDataset — see CustomerSnapshots for the general leakage
 * boundary. What's new here is that BOTH the features and the label are
 * primarily driven by "support foci" rather than invoices:
 *
 * Support-hours definition (reused verbatim from the rest of the app, NOT
 * reinvented): foci attached directly to the company — `parent_type =
 * Company::class`, i.e. `$company->foci()` / `CustomerSnapshots::fociFor()` —
 * as opposed to foci logged against a project. This is the same predicate
 * `CompanyBuilder::whereHasUnbilledFoci()`, `WidgetController::
 * GET_CASHFLOW_CUSTOMER_SUPPORT` and `addFociBadges()` all use to identify
 * "support" work. Unlike `foci_unbilled` (used for the CASHFLOW_CUSTOMER_SUPPORT
 * forecast of money still to be invoiced), this dataset sums ALL support-focus
 * duration regardless of billed/unpaid status — the forecast target is hours
 * actually worked, not just what's still awaiting invoicing.
 *
 * The cutoff grid is quarterly over the company's OWN support-focus history
 * (CustomerSnapshots::fociCandidateCutoffs, keyed on `started_at`, not an
 * invoice's `created_at` — Focus rows don't have a comparable column), not
 * its invoice history — a customer can have a long invoice history with only
 * a recent burst of support activity, and the snapshot grid should track
 * where the LABEL signal actually lives.
 */
class SupportLoadDataset {
    public const FEATURES = [
        'trailing_3m_support_hours',
        'trailing_6m_support_hours',
        'trailing_12m_support_hours',
        'lifetime_support_hours',
        'support_ticket_count_trailing_12m',
        'active_project_count_at_cutoff',
        'trailing_12m_revenue',
        'tenure_days',
        'days_since_last_support',
        'accepts_support',
    ];
    public const LABEL         = 'support_hours_next_window';
    public const WINDOW_MONTHS = 3;

    /** Minimum pre-cutoff support foci for a snapshot to be usable (mirrors CustomerRevenueDataset::MIN_PRIOR_INVOICES). */
    public const MIN_PRIOR_SUPPORT_FOCI = 2;

    /**
     * @return Collection<int, Company>
     */
    public static function eligibleCompanies(): Collection {
        return CustomerSnapshots::eligibleCompaniesQuery()
            ->withCount('foci')
            ->having('foci_count', '>=', self::MIN_PRIOR_SUPPORT_FOCI)
            ->get();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public static function extractRowsForCompany(Company $company): array {
        $foci = CustomerSnapshots::fociFor($company);
        if ($foci->count() < self::MIN_PRIOR_SUPPORT_FOCI) {
            return [];
        }

        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();

        $lastFocusAt = Carbon::parse($foci->last()->started_at);
        $rows        = [];

        foreach (CustomerSnapshots::fociCandidateCutoffs($foci) as $cutoff) {
            $before = CustomerSnapshots::fociBefore($foci, $cutoff);
            if ($before->count() < self::MIN_PRIOR_SUPPORT_FOCI) {
                continue;
            }

            if ($cutoff->copy()->addMonthsNoOverflow(self::WINDOW_MONTHS)->gt($lastFocusAt)) {
                continue;
            }

            $rows[] = self::extractRow($company, $foci, $invoices, $projects, $cutoff);
        }
        return $rows;
    }

    /**
     * One (company, cutoff) snapshot's features + label.
     *
     * @param Collection<int, Focus> $foci ALL of the company's support foci (CustomerSnapshots::fociFor())
     * @param Collection<int, Invoice> $invoices ALL of the company's non-cancelled invoices (CustomerSnapshots::invoicesFor())
     * @param Collection<int, Project> $projects ALL of the company's projects, with `states` eager-loaded
     * @return array<string, mixed>
     */
    public static function extractRow(Company $company, Collection $foci, Collection $invoices, Collection $projects, Carbon $cutoff): array {
        $before      = CustomerSnapshots::fociBefore($foci, $cutoff);
        $labelWindow = CustomerSnapshots::fociInWindow($foci, $cutoff, self::WINDOW_MONTHS);

        $trailing3m  = $before->filter(fn ($f) => Carbon::parse($f->started_at)->gt($cutoff->copy()->subMonthsNoOverflow(3)));
        $trailing6m  = $before->filter(fn ($f) => Carbon::parse($f->started_at)->gt($cutoff->copy()->subMonthsNoOverflow(6)));
        $trailing12m = $before->filter(fn ($f) => Carbon::parse($f->started_at)->gt($cutoff->copy()->subMonthsNoOverflow(12)));

        $invoicesBefore      = CustomerSnapshots::invoicesBefore($invoices, $cutoff);
        $invoicesTrailing12m = $invoicesBefore->filter(fn ($i) => Carbon::parse($i->created_at)->gt($cutoff->copy()->subMonthsNoOverflow(12)));

        $firstFocusAt   = Carbon::parse($foci->first()->started_at);
        $firstInvoiceAt = $invoices->isNotEmpty() ? Carbon::parse($invoices->first()->created_at) : null;
        $tenureStart    = ($firstInvoiceAt && $firstInvoiceAt->lt($firstFocusAt)) ? $firstInvoiceAt : $firstFocusAt;

        $lastBeforeFocusAt = Carbon::parse($before->last()->started_at);

        return [
            'company_id'                         => $company->id,
            'cutoff'                             => $cutoff->toDateString(),
            'trailing_3m_support_hours'          => CustomerSnapshots::sumDuration($trailing3m),
            'trailing_6m_support_hours'          => CustomerSnapshots::sumDuration($trailing6m),
            'trailing_12m_support_hours'         => CustomerSnapshots::sumDuration($trailing12m),
            'lifetime_support_hours'             => CustomerSnapshots::sumDuration($before),
            'support_ticket_count_trailing_12m'  => $trailing12m->map(fn ($f) => $f->invoice_item_id ?? "focus_{$f->id}")->unique()->count(),
            'active_project_count_at_cutoff'     => self::activeProjectCountAtCutoff($projects, $cutoff),
            'trailing_12m_revenue'               => CustomerSnapshots::sumNet($invoicesTrailing12m),
            'tenure_days'                        => $tenureStart->diffInDays($cutoff),
            'days_since_last_support'            => $lastBeforeFocusAt->diffInDays($cutoff),
            'accepts_support'                    => $company->accepts_support ? 1.0 : 0.0,
            self::LABEL                          => CustomerSnapshots::sumDuration($labelWindow),
        ];
    }

    /**
     * Point-in-time "still open" project count as of the cutoff: projects that
     * existed by the cutoff (`created_at <= cutoff`) whose most recent state
     * change AT OR BEFORE the cutoff (if any) was not Finished. Project::states()
     * is already ordered latest-pivot-first, so the first state with a pivot
     * `created_at <= cutoff` IS the latest one as of the cutoff.
     *
     * @param Collection<int, Project> $projects with `states` eager-loaded
     */
    private static function activeProjectCountAtCutoff(Collection $projects, Carbon $cutoff): int {
        return $projects
            ->filter(fn ($project) => Carbon::parse($project->created_at)->lte($cutoff))
            ->filter(function ($project) use ($cutoff) {
                $latestStateBeforeCutoff = $project->states->first(fn ($state) => Carbon::parse($state->pivot->created_at)->lte($cutoff));
                return $latestStateBeforeCutoff === null || (int)$latestStateBeforeCutoff->progress !== ProjectState::Finished;
            })
            ->count();
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

    public static function logLabel(float $hours): float {
        return log(max(0.0, $hours) + 1);
    }
}
