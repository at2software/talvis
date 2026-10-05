<?php

namespace App\ML;

use Carbon\Carbon;

class MlReliabilitySummary {
    /**
     * @param array{n: int, estimators: array<string, array<string, float>>, baseline: array<string, float>} $evaluation
     */
    public static function forRegression(array $evaluation, string $bestName, string $baselineLabel, ?Carbon $now = null): array {
        $best     = $evaluation['estimators'][$bestName];
        $baseline = $evaluation['baseline'];
        $beats    = $best['mae'] < $baseline['mae'];

        return [
            'estimator'      => $bestName,
            'primary_metric' => 'MAE',
            'value'          => round($best['mae'], 2),
            'r2'             => round($best['r2'], 3),
            'smape'          => round($best['smape'], 2),
            'beats_baseline' => $beats,
            'baseline_label' => $baselineLabel,
            'baseline_value' => round($baseline['mae'], 2),
            'n'              => $evaluation['n'],
            'bucket'         => self::regressionBucket($beats, $best['r2']),
            'trained_at'     => ($now ?? Carbon::now())->toIso8601String(),
        ];
    }

    /**
     * @param array{n: int, estimators: array<string, array<string, float>>, baseline: array<string, float>} $evaluation
     */
    public static function forClassification(array $evaluation, string $bestName, string $baselineLabel, ?Carbon $now = null): array {
        $best     = $evaluation['estimators'][$bestName];
        $baseline = $evaluation['baseline'];
        $beats    = $best['f1'] > $baseline['f1'];

        return [
            'estimator'      => $bestName,
            'primary_metric' => 'F1',
            'value'          => round($best['f1'], 3),
            'accuracy'       => round($best['accuracy'], 3),
            'mcc'            => round($best['mcc'], 3),
            'precision'      => round($best['precision'], 3),
            'recall'         => round($best['recall'], 3),
            'beats_baseline' => $beats,
            'baseline_label' => $baselineLabel,
            'baseline_value' => round($baseline['f1'], 3),
            'n'              => $evaluation['n'],
            'bucket'         => self::classificationBucket($beats, $best['mcc']),
            'trained_at'     => ($now ?? Carbon::now())->toIso8601String(),
        ];
    }

    public static function regressionBucket(bool $beatsBaseline, float $r2): string {
        if (! $beatsBaseline) {
            return 'low';
        }
        return $r2 >= 0.4 ? 'high' : 'moderate';
    }
    public static function classificationBucket(bool $beatsBaseline, float $mcc): string {
        if (! $beatsBaseline) {
            return 'low';
        }
        return $mcc >= 0.4 ? 'high' : 'moderate';
    }
}
