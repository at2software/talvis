<?php

namespace App\ML;

use App\Enums\InvoiceItemType;
use App\Models\Param;
use App\Models\Project;
use App\Models\ProjectState;
use App\Models\TextParam;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Feature extraction for the quote-acceptance model — the single source of
 * truth shared between training (TrainProjectQuoteModel) and inference
 * (ProjectQuoteModel::predict() / ProjectQuoteAcceptanceService).
 *
 * "Accepted" = the project has EVER had a state with progress === Running,
 * regardless of what happens afterwards (success, failure, later marked
 * "ignored") — a quote that was ordered stays ordered. This is deliberately
 * NOT the same as `is_successful` or the existing `PROJECT_SUCCESS_RATE`
 * param (see App\Queries\ProjectSuccessQuoteQuery), which measure eventual
 * project outcome, not quote acceptance.
 */
class ProjectQuoteDataset {
    public const FEATURES = [
        'item_count',
        'net',
        'discount_pct',
        'prefix_length',
        'days_pending',
        'company_acceptance_rate',
        'company_prior_decided_count',
    ];
    public const LABEL = 'accepted';

    public static function eligibleQuery(): Builder {
        return Project::whereBudgetBased()
            ->whereHasDesicion()
            ->whereHas('firstDecisionState', fn ($q) => $q->where('is_in_stats', true))
            ->with(['states', 'company', 'invoiceItemsRaw']);
    }
    public static function eligibleProjects(): Collection {
        return static::eligibleQuery()->get();
    }
    public static function isAccepted(Project $project): bool {
        return $project->states->contains(fn (ProjectState $state) => $state->progress === ProjectState::Running);
    }

    /**
     * One project's features, plus its leak-safe company-history features if
     * $history is supplied (see ProjectQuoteHistory::compute()) — omitted
     * history keys come out null/0, which downstream (ProjectQuoteModel)
     * treats as missing data, not as "no prior quotes".
     *
     * $prefixLength overrides the (expensive, DB-hitting) live PROJECT_PREFIX
     * resolution — pass it when the caller already bulk-resolved prefix
     * lengths for a whole set (see extractRows()/resolvePrefixLengths()).
     *
     * @return array<string, mixed> feature values keyed by ProjectQuoteDataset::FEATURES, plus the label
     */
    public static function extractRow(Project $project, array $history = [], ?int $prefixLength = null): array {
        $items = $project->invoiceItemsRaw->whereIn('type', InvoiceItemType::ProjectTotal);

        $defaultItems = $items->filter(fn ($item) => $item->type === InvoiceItemType::Default);
        $listValue    = (float)$defaultItems->sum(fn ($item) => $item->price * $item->qty);
        $discountPct  = $listValue > 0
            ? (float)$defaultItems->sum(fn ($item) => $item->discount * $item->price * $item->qty) / $listValue
            : 0.0;

        return [
            'company_id'                   => $project->company_id,
            'item_count'                   => $defaultItems->count(),
            'net'                          => (float)$items->sum('net'),
            'discount_pct'                 => $discountPct,
            'prefix_length'                => $prefixLength ?? mb_strlen(self::resolvePrefix($project) ?? ''),
            'days_pending'                 => self::daysPending($project, $history['decision_cutoff'] ?? null),
            'company_acceptance_rate'      => $history['company_acceptance_rate'] ?? null,
            'company_prior_decided_count'  => $history['company_prior_decided_count'] ?? 0,
            self::LABEL                    => self::isAccepted($project) ? 1 : 0,
        ];
    }

    /**
     * Days between the quote's creation and its decision — for a still-open
     * quote (no decision yet), "days pending SO FAR" (created_at -> now), the
     * same fallback-to-now used by ProjectQuoteHistory's cutoff. Not leakage
     * (only ever uses information available at/before the cutoff), but it IS
     * a different quantity at inference time than at training time: training
     * rows see the FINAL elapsed time once decided, inference sees a growing,
     * right-censored elapsed time for quotes with no answer yet. Rejected
     * quotes take dramatically longer to reach a decision than accepted ones
     * (median 63.5 vs 2.6 days, verified against real data) — the single
     * strongest feature found for this model.
     *
     * $cutoff, when supplied, is the caller's already-resolved decision_at-or-
     * now cutoff (see ProjectQuoteHistory::compute()'s 'decision_cutoff') —
     * decision_at is a computed accessor (a live query, not a real column),
     * so reusing it here avoids resolving it a 2nd time for the same project.
     */
    private static function daysPending(Project $project, ?Carbon $cutoff = null): int {
        if (! $project->created_at) {
            return 0;
        }
        $cutoff ??= $project->decision_at ?? Carbon::now();
        return max(0, (int)round($project->created_at->diffInDays($cutoff)));
    }

    /**
     * @param Collection<int, Project> $projects
     * @return Collection<int, array<string, mixed>>
     */
    public static function extractRows(Collection $projects): Collection {
        $history       = ProjectQuoteHistory::compute($projects, $projects);
        $prefixLengths = self::resolvePrefixLengths($projects);

        return $projects->map(fn (Project $project) => self::extractRow($project, $history[$project->id] ?? [], $prefixLengths[$project->id]));
    }

    /**
     * The project's resolved PROJECT_PREFIX text — a per-project override if
     * set, else the global fallback (see Project::param(), 2nd arg = fallback)
     * — same call GenerateProjectQuoteAction::buildContent() makes when it
     * actually renders the quote PDF.
     */
    private static function resolvePrefix(Project $project): ?string {
        if (! $project->company) {
            return null;
        }
        $value = $project->param('PROJECT_PREFIX', true)
            ->localizedValue($project->company->getLanguage(), $project->company->getFormality());
        return is_string($value) ? $value : null;
    }

    /**
     * Bulk equivalent of resolvePrefix() + mb_strlen(), for a whole pool —
     * Project::param()->localizedValue() hits the DB 2+ times per call
     * (Param::linkTo()'s lazy relation resolution), which turns into
     * thousands of queries for the eligible pool (~2000+ projects). Instead,
     * fetch the global fallback and every per-project override in exactly
     * two queries and resolve each project's language/formality variant in
     * memory.
     *
     * @param Collection<int, Project> $projects
     * @return array<int, int> prefix length keyed by project id
     */
    private static function resolvePrefixLengths(Collection $projects): array {
        $param = Param::get('PROJECT_PREFIX', doNotCreate: true);
        if (! $param) {
            return $projects->map(fn () => 0)->all();
        }

        $overridesByProjectId = TextParam::where('param_id', $param->id)
            ->where('parent_type', Project::class)
            ->whereIn('parent_id', $projects->pluck('id'))
            ->orderByDesc('id')
            ->get()
            ->unique('parent_id')
            ->keyBy('parent_id');

        $fallback = TextParam::where('param_id', $param->id)
            ->whereNull('parent_id')
            ->latest('id')
            ->first();

        // TextParam::value is I18n-cast, which re-queries the i18n table on
        // EVERY access whenever the raw value is the '@@i18n' marker — plain
        // CastsAttributes casts aren't memoized by Eloquent like Attribute::
        // make() accessors are. Read each row's value exactly once instead
        // of once per project (the fallback row alone would otherwise be
        // re-queried for every project without its own override).
        $rawValueByRowId = [];
        foreach ($overridesByProjectId as $row) {
            $rawValueByRowId[$row->id] = $row->value;
        }
        $fallbackValue = $fallback?->value;

        $result = [];
        foreach ($projects as $project) {
            $row      = $overridesByProjectId->get($project->id);
            $rawValue = $row ? $rawValueByRowId[$row->id] : $fallbackValue;
            if ($rawValue === null || ! $project->company) {
                $result[$project->id] = 0;
                continue;
            }
            $localized             = Param::localizeI18nValue($rawValue, $project->company->getLanguage(), $project->company->getFormality());
            $result[$project->id]  = mb_strlen(is_string($localized) ? $localized : '');
        }
        return $result;
    }
}
