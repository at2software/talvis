<?php

namespace App\ML;

use App\Models\Company;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\Param;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class CustomerSnapshots {
    public const CUTOFF_STEP_MONTHS = 3;

    /** Exclude the own company (ME_ID) and deprecated/inactive customers — mirrors CompanyBuilder::whereActive(). */
    public static function eligibleCompaniesQuery(): Builder {
        $meId = Param::get('ME_ID')->value;

        return Company::whereActive()
            ->whereNot('id', $meId);
    }

    /**
     * Non-cancelled invoices for a company, oldest first. `is_cancelled` may be
     * null (legacy rows) — treat null as "not cancelled", the same pattern used in
     * BackfillForecastRevenue12::computeRevenue().
     *
     * @return Collection<int, Invoice>
     */
    public static function invoicesFor(Company $company): Collection {
        return $company->invoices()
            ->where(fn ($q) => $q->where('is_cancelled', false)->orWhereNull('is_cancelled'))
            ->orderBy('created_at')
            ->with('invoiceItems')
            ->get();
    }

    /**
     * @param Collection<int, Invoice> $invoices oldest-first, from invoicesFor()
     * @return Carbon[]
     */
    public static function candidateCutoffs(Collection $invoices): array {
        if ($invoices->count() < 2) {
            return [];
        }

        $first = Carbon::parse($invoices->first()->created_at)->startOfMonth();
        $last  = Carbon::parse($invoices->last()->created_at)->startOfMonth();

        $cutoffs = [];
        $cursor  = $first->copy();
        while ($cursor->lte($last)) {
            $cutoffs[] = $cursor->copy()->endOfMonth();
            $cursor->addMonths(self::CUTOFF_STEP_MONTHS);
        }
        return $cutoffs;
    }

    public static function invoicesBefore(Collection $invoices, Carbon $cutoff): Collection {
        return $invoices->filter(fn ($invoice) => Carbon::parse($invoice->created_at)->lte($cutoff))->values();
    }
    public static function invoicesAfter(Collection $invoices, Carbon $cutoff): Collection {
        return $invoices->filter(fn ($invoice) => Carbon::parse($invoice->created_at)->gt($cutoff))->values();
    }
    public static function invoicesInWindow(Collection $invoices, Carbon $cutoff, int $months): Collection {
        $end = $cutoff->copy()->addMonths($months);
        return $invoices->filter(function ($invoice) use ($cutoff, $end) {
            $at = Carbon::parse($invoice->created_at);
            return $at->gt($cutoff) && $at->lte($end);
        })->values();
    }
    public static function sumNet(Collection $invoices): float {
        return (float)$invoices->sum(fn ($invoice) => $invoice->net);
    }

    /**
     * Support foci for a company, oldest first — foci attached directly to the
     * company (`parent_type = Company::class`, i.e. `$company->foci()`), the
     * SAME predicate used by `CompanyBuilder::whereHasUnbilledFoci()` /
     * `WidgetController::GET_CASHFLOW_CUSTOMER_SUPPORT` / `addFociBadges()`, as
     * opposed to foci logged against a project (a budget project's own work).
     * Unlike `foci_unbilled`, this deliberately does NOT filter by billed/unpaid
     * status — a support-load forecast should reflect all hours actually
     * worked, not just what's still awaiting invoicing (see
     * docs/ml/support-load-plan.md).
     *
     * @return Collection<int, Focus>
     */
    public static function fociFor(Company $company): Collection {
        return $company->foci()->orderBy('started_at')->get();
    }

    /**
     * @param Collection<int, Focus> $foci oldest-first, from fociFor()
     * @return Carbon[]
     */
    public static function fociCandidateCutoffs(Collection $foci): array {
        if ($foci->count() < 2) {
            return [];
        }

        $first = Carbon::parse($foci->first()->started_at)->startOfMonth();
        $last  = Carbon::parse($foci->last()->started_at)->startOfMonth();

        $cutoffs = [];
        $cursor  = $first->copy();
        while ($cursor->lte($last)) {
            $cutoffs[] = $cursor->copy()->endOfMonth();
            $cursor->addMonths(self::CUTOFF_STEP_MONTHS);
        }
        return $cutoffs;
    }

    public static function fociBefore(Collection $foci, Carbon $cutoff): Collection {
        return $foci->filter(fn ($focus) => Carbon::parse($focus->started_at)->lte($cutoff))->values();
    }
    public static function fociAfter(Collection $foci, Carbon $cutoff): Collection {
        return $foci->filter(fn ($focus) => Carbon::parse($focus->started_at)->gt($cutoff))->values();
    }
    public static function fociInWindow(Collection $foci, Carbon $cutoff, int $months): Collection {
        $end = $cutoff->copy()->addMonthsNoOverflow($months);
        return $foci->filter(function ($focus) use ($cutoff, $end) {
            $at = Carbon::parse($focus->started_at);
            return $at->gt($cutoff) && $at->lte($end);
        })->values();
    }
    public static function sumDuration(Collection $foci): float {
        return (float)$foci->sum(fn ($focus) => $focus->duration);
    }

    /** @param float[] $gapsInDays consecutive inter-purchase gaps, oldest-pair-first */
    public static function meanGap(array $gapsInDays): ?float {
        return count($gapsInDays) > 0 ? array_sum($gapsInDays) / count($gapsInDays) : null;
    }

    /** @param float[] $values */
    public static function median(array $values): ?float {
        $n = count($values);
        if ($n === 0) {
            return null;
        }
        sort($values);
        return $n % 2 === 1
            ? (float)$values[intdiv($n, 2)]
            : ($values[$n / 2 - 1] + $values[$n / 2]) / 2;
    }

    /** @param float[] $values */
    public static function stddev(array $values, ?float $mean): ?float {
        $n = count($values);
        if ($n === 0 || $mean === null) {
            return null;
        }
        $variance = array_sum(array_map(fn ($v) => ($v - $mean) ** 2, $values)) / $n;
        return sqrt($variance);
    }

    /**
     * @param Collection<int, Carbon> $dates oldest first
     * @return float[]
     */
    public static function consecutiveGaps(Collection $dates): array {
        $gaps = [];
        for ($i = 1; $i < $dates->count(); $i++) {
            $gaps[] = $dates[$i - 1]->diffInDays($dates[$i]);
        }
        return $gaps;
    }
}
