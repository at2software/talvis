<?php

namespace App\ML;

use Illuminate\Support\Collection;

/**
 * "What would move the needle?" sensitivity analysis for a single quote's
 * predicted acceptance probability. Given the quote's current feature row and
 * its baseline probability (ProjectQuoteModel::predict()), perturbs each
 * ACTIONABLE feature one at a time — holding all others fixed — and reports
 * which changes move the prediction meaningfully.
 *
 * `company_acceptance_rate` / `company_prior_decided_count` / `days_pending`
 * are deliberately excluded: they describe the customer's track record or
 * elapsed time, not something a PM writing THIS quote can change.
 *
 * Returns structured data only (feature, from, to, delta, new_probability) —
 * no hardcoded sentences. The frontend composes localized suggestion text
 * from a small, fixed per-feature template set.
 */
class ProjectQuoteWhatIf {
    private const MIN_DELTA                    = 0.02;
    private const MAX_SUGGESTIONS              = 4;
    private const REPRESENTATIVE_PREFIX_LENGTH = 628.0;

    /**
     * @param array<string, mixed> $baselineRow ProjectQuoteDataset::extractRow() output for the quote under evaluation
     * @return array<int, array{feature: string, from: float, to: float, delta: float, new_probability: float}> best variation per feature, sorted by delta desc
     */
    public static function suggest(array $baselineRow, float $baselineProbability): array {
        $variations = self::variations($baselineRow);
        if (empty($variations)) {
            return [];
        }

        $rows = array_map(function (array $variation) use ($baselineRow) {
            $row                             = $baselineRow;
            $row[$variation['feature']]      = $variation['to'];
            return $row;
        }, $variations);

        $probabilities = ProjectQuoteModel::probaForRows($rows);
        if (empty($probabilities)) {
            return [];
        }

        $candidates = collect($variations)->map(function (array $variation, int $i) use ($probabilities, $baselineProbability) {
            $newProbability = $probabilities[$i];
            return [
                'feature'         => $variation['feature'],
                'from'            => $variation['from'],
                'to'              => $variation['to'],
                'delta'           => $newProbability - $baselineProbability,
                'new_probability' => $newProbability,
            ];
        })->filter(fn (array $c) => $c['delta'] >= self::MIN_DELTA);

        return $candidates
            ->groupBy('feature')
            ->map(fn (Collection $group) => $group->sortByDesc('delta')->first())
            ->sortByDesc('delta')
            ->take(self::MAX_SUGGESTIONS)
            ->values()
            ->all();
    }

    /**
     * @return array<int, array{feature: string, from: float, to: float}>
     */
    private static function variations(array $row): array {
        $itemCount    = (float)$row['item_count'];
        $net          = (float)$row['net'];
        $discountPct  = (float)$row['discount_pct'];
        $prefixLength = (float)$row['prefix_length'];

        $variations = [];

        foreach ([1.0, 2.0] as $delta) {
            $variations[] = ['feature' => 'item_count', 'from' => $itemCount, 'to' => $itemCount + $delta];
        }
        if ($itemCount >= 1) {
            $variations[] = ['feature' => 'item_count', 'from' => $itemCount, 'to' => max(0.0, $itemCount - 1)];
        }

        foreach ([-0.2, -0.1, 0.1, 0.2] as $pct) {
            $variations[] = ['feature' => 'net', 'from' => $net, 'to' => max(0.0, $net * (1 + $pct))];
        }

        foreach ([5.0, 10.0] as $pointsMore) {
            $variations[] = ['feature' => 'discount_pct', 'from' => $discountPct, 'to' => min(100.0, $discountPct + $pointsMore)];
        }

        $variations[] = $prefixLength <= 0
            ? ['feature' => 'prefix_length', 'from' => $prefixLength, 'to' => self::REPRESENTATIVE_PREFIX_LENGTH]
            : ['feature' => 'prefix_length', 'from' => $prefixLength, 'to' => $prefixLength * 1.5];

        return $variations;
    }
}
