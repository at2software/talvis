<?php

namespace App\Services;

use App\Models\Company;
use App\Models\FloatParam;
use App\Models\Invoice;
use App\Models\Param;
use Carbon\Carbon;
use Exception;
use Illuminate\Console\Command;

class ForecastService {
    private const PARAM_KEYS = [
        'CASHFLOW_PROJECTS_ACQUISITIONS',
        'CASHFLOW_PROJECTS_TIMEBASED',
        'CASHFLOW_PROJECTS',
    ];

    private ?Command $console = null;

    public function execute(?Carbon $evaluationDate = null, bool $shouldStore = true, ?Command $console = null): int {
        $this->console  = $console;
        $evaluationDate = $evaluationDate ?: Carbon::now();

        $this->info('Linear Regression Forecast Analysis - '.$evaluationDate->format('Y-m-d'));

        $endDate   = $evaluationDate->copy()->subYear();
        $startDate = $endDate->copy()->subYears(5);

        $trainingData = [];
        $current      = $startDate->copy();

        while ($current->lt($endDate)) {
            $monthData = $this->collectMonthData($current, $evaluationDate);
            if ($monthData) {
                $trainingData[] = $monthData;
            }
            $current->addMonth();
        }

        $this->performLinearRegression($trainingData, $shouldStore, $evaluationDate);

        return 0;
    }
    private function collectMonthData(Carbon $month, ?Carbon $evaluationDate = null): ?array {
        $futureStart = $month->copy()->addMonth();
        $futureEnd   = $futureStart->copy()->addMonths(11)->endOfMonth();

        $dependentVariable = Invoice::whereBetween('created_at', [$futureStart, $futureEnd])
            ->sum('net');

        $currentTime = $evaluationDate ?: Carbon::now();

        if ($futureEnd->gt($currentTime)) {
            return null;
        }

        $data = [
            'month'       => $month->format('Y-m'),
            'dependent_y' => $dependentVariable,
        ];

        $data['revenue_lag_3']  = $this->getRevenueForMonth($month->copy()->subMonths(3));
        $data['revenue_lag_6']  = $this->getRevenueForMonth($month->copy()->subMonths(6));
        $data['revenue_lag_12'] = $this->getRevenueForMonth($month->copy()->subMonths(12));

        $customerRevenueData = $this->getCustomerRevenueData($month);
        $data                = array_merge($data, $customerRevenueData);

        foreach (self::PARAM_KEYS as $key) {
            $paramId = Param::where('key', $key)->value('id');
            if (! $paramId) {
                continue;
            }

            $baseValue = $this->getParamFor($paramId, $month);

            $absoluteValues = [];
            $deltaValues    = [];

            for ($i = 0; $i < 24; $i++) {
                $lookbackMonth = $month->copy()->subMonths($i + 1);
                $value         = $this->getParamFor($paramId, $lookbackMonth);

                $absoluteValues[$i] = $value;
                $deltaValues[$i]    = $baseValue - $value;
            }

            $data["{$key}_abs"]   = $absoluteValues;
            $data["{$key}_delta"] = $deltaValues;

            $data["{$key}_ma_3"]  = $this->calculateMovingAverage($paramId, $month, 3);
            $data["{$key}_ma_6"]  = $this->calculateMovingAverage($paramId, $month, 6);
            $data["{$key}_ma_12"] = $this->calculateMovingAverage($paramId, $month, 12);
        }
        return $data;
    }
    private function getParamFor(int $paramId, Carbon $date): ?float {
        return FloatParam::where('param_id', $paramId)
            ->whereBetween('created_at', [
                $date->copy()->startOfMonth(),
                $date->copy()->endOfMonth(),
            ])
            ->oldest()
            ->value('value');
    }
    private function getRevenueForMonth(Carbon $month): ?float {
        return Invoice::whereBetween('created_at', [
            $month->copy()->startOfMonth(),
            $month->copy()->endOfMonth(),
        ])->sum('net');
    }
    private function calculateMovingAverage(int $paramId, Carbon $baseMonth, int $periods): ?float {
        $values = [];

        for ($i = 1; $i <= $periods; $i++) {
            $month = $baseMonth->copy()->subMonths($i);
            $value = $this->getParamFor($paramId, $month);
            if ($value !== null) {
                $values[] = $value;
            }
        }

        if (empty($values)) {
            return null;
        }
        return array_sum($values) / count($values);
    }
    private function getCustomerRevenueData(Carbon $month): array {
        $data = [];

        $currentStats                    = $this->getCustomerRevenueStats($month);
        $data['customer_revenue_sum']    = $currentStats['sum'];
        $data['customer_revenue_avg']    = $currentStats['avg'];
        $data['customer_revenue_count']  = $currentStats['count'];
        $data['customer_revenue_median'] = $currentStats['median'];

        $historicalValues = [];
        for ($i = 1; $i <= 12; $i++) {
            $lookbackMonth      = $month->copy()->subMonths($i);
            $stats              = $this->getCustomerRevenueStats($lookbackMonth);
            $historicalValues[] = $stats['sum'];
        }

        if (count($historicalValues) >= 3) {
            $data['customer_revenue_ma_3'] = array_sum(array_slice($historicalValues, 0, 3)) / 3;
        }
        if (count($historicalValues) >= 6) {
            $data['customer_revenue_ma_6'] = array_sum(array_slice($historicalValues, 0, 6)) / 6;
        }
        if (count($historicalValues) >= 12) {
            $data['customer_revenue_ma_12'] = array_sum($historicalValues) / 12;
        }

        if (isset($historicalValues[2])) {
            $data['customer_revenue_delta_3'] = $currentStats['sum'] - $historicalValues[2];
        }
        if (isset($historicalValues[5])) {
            $data['customer_revenue_delta_6'] = $currentStats['sum'] - $historicalValues[5];
        }
        if (isset($historicalValues[11])) {
            $data['customer_revenue_delta_12'] = $currentStats['sum'] - $historicalValues[11];
        }

        if (isset($historicalValues[2]) && $historicalValues[2] > 0) {
            $data['customer_revenue_growth_3m'] = ($currentStats['sum'] - $historicalValues[2]) / $historicalValues[2];
        }
        if (isset($historicalValues[5]) && $historicalValues[5] > 0) {
            $data['customer_revenue_growth_6m'] = ($currentStats['sum'] - $historicalValues[5]) / $historicalValues[5];
        }
        return $data;
    }
    private function getCustomerRevenueStats(Carbon $month): array {
        $paramExists = Param::where('id', 3)->exists();
        if (! $paramExists) {
            $invoiceRevenueParam = Param::where('key', 'INVOICE_REVENUE_12M')->first();
            if ($invoiceRevenueParam) {
                $paramId = $invoiceRevenueParam->id;
            } else {
                return ['sum' => 0, 'avg' => 0, 'count' => 0, 'median' => 0];
            }
        } else {
            $paramId = 3;
        }

        $monthStart = $month->copy()->startOfMonth();
        $monthEnd   = $month->copy()->endOfMonth();

        $revenues = FloatParam::where('param_id', $paramId)
            ->whereParentType(Company::class)
            ->whereBetween('created_at', [$monthStart, $monthEnd])
            ->pluck('value')
            ->filter(function ($value) {
                return $value !== null && $value > 0;
            })
            ->values()
            ->toArray();

        if (empty($revenues)) {
            return [
                'sum'    => 0,
                'avg'    => 0,
                'count'  => 0,
                'median' => 0,
            ];
        }

        sort($revenues);
        $count = count($revenues);
        $sum   = array_sum($revenues);
        $avg   = $sum / $count;

        if ($count % 2 === 0) {
            $median = ($revenues[$count / 2 - 1] + $revenues[$count / 2]) / 2;
        } else {
            $median = $revenues[intval($count / 2)];
        }
        return [
            'sum'    => $sum,
            'avg'    => $avg,
            'count'  => $count,
            'median' => $median,
        ];
    }
    private function performLinearRegression(array $trainingData, bool $shouldStore = true, ?Carbon $evaluationDate = null) {
        if (empty($trainingData)) {
            $this->error('No training data available');
            return;
        }

        if (! empty($trainingData)) {
            $sampleData       = $trainingData[0];
            $customerFeatures = array_filter(array_keys($sampleData), fn ($key) => strpos($key, 'customer_revenue') !== false);

            foreach ($customerFeatures as $feature) {
                $nonZeroCount = count(array_filter($trainingData, fn ($data) => ! empty($data[$feature]) && $data[$feature] > 0));
            }
        }

        $this->analyzeFeatureCorrelations($trainingData);

        $featureCombinations = $this->generateFeatureCombinations();

        $bestR2           = -1;
        $bestFeatures     = [];
        $bestCoefficients = [];
        $topResults       = [];

        $customerFeatureCombos    = 0;
        $successfulCustomerCombos = 0;

        foreach ($featureCombinations as $features) {
            $hasCustomer = ! empty(array_filter($features, fn ($f) => strpos($f, 'customer_revenue') !== false));
            if ($hasCustomer) {
                $customerFeatureCombos++;
            }

            $result = $this->calculateLinearRegression($trainingData, $features);

            if ($result && $hasCustomer) {
                $successfulCustomerCombos++;
            }

            if ($result) {
                $diversityScore = $this->calculateDiversityScore($features);
                $adjustedScore  = $result['r2'] + ($diversityScore * 0.02); // Small bonus for diversity

                $shouldUpdate = false;
                if ($result['r2'] > $bestR2) {
                    $shouldUpdate = true;
                } elseif (abs($result['r2'] - $bestR2) <= 0.02 && $diversityScore > $this->calculateDiversityScore($bestFeatures)) {
                    $shouldUpdate = true;
                }

                if ($shouldUpdate) {
                    $bestR2           = $result['r2'];
                    $bestFeatures     = $features;
                    $bestCoefficients = $result['coefficients'];
                }
            }

            if ($result && $result['r2'] > 0.3) {
                $topResults[] = [
                    'features'     => $features,
                    'r2'           => $result['r2'],
                    'coefficients' => $result['coefficients'],
                ];
            }
        }

        $customerResults = array_filter($topResults, fn ($r) => ! empty(array_filter($r['features'], fn ($f) => strpos($f, 'customer_revenue') !== false)));
        usort($customerResults, fn ($a, $b) => $b['r2'] <=> $a['r2']);
        $topCustomerResults = array_slice($customerResults, 0, 3);

        if (! empty($topCustomerResults)) {
            foreach ($topCustomerResults as $i => $result) {
            }
        } else {
        }

        usort($topResults, fn ($a, $b) => $b['r2'] <=> $a['r2']);
        $topResults = array_slice($topResults, 0, 5);

        $this->outputEnhancedResults($bestFeatures, $bestCoefficients, $bestR2, $topResults, count($trainingData));

        $forecast = $this->generateForecast($bestFeatures, $bestCoefficients, $trainingData, $bestR2);

        if ($shouldStore && $forecast) {
            $this->storeResults($bestFeatures, $bestCoefficients, $bestR2, $forecast, $evaluationDate);
        }

        if ($shouldStore) {
            $this->generateCompanyForecasts($evaluationDate);
        }
    }
    public function runAnalysis(?Carbon $evaluationDate = null, bool $shouldStore = true): ?array {
        $evaluationDate = $evaluationDate ?: Carbon::now();

        $endDate   = $evaluationDate->copy()->subYear();
        $startDate = $endDate->copy()->subYears(5);

        $trainingData = [];
        $current      = $startDate->copy();

        while ($current->lt($endDate)) {
            $monthData = $this->collectMonthData($current, $evaluationDate);
            if ($monthData) {
                $trainingData[] = $monthData;
            }
            $current->addMonth();
        }

        if (count($trainingData) < 10) {
            return null; // Not enough training data
        }

        $featureCombinations = $this->generateFeatureCombinations();

        $bestR2           = -1;
        $bestFeatures     = [];
        $bestCoefficients = [];

        foreach ($featureCombinations as $features) {
            $result = $this->calculateLinearRegression($trainingData, $features);

            if ($result) {
                $diversityScore = $this->calculateDiversityScore($features);
                $shouldUpdate   = false;

                if ($result['r2'] > $bestR2) {
                    $shouldUpdate = true;
                } elseif (abs($result['r2'] - $bestR2) <= 0.02 && $diversityScore > $this->calculateDiversityScore($bestFeatures)) {
                    $shouldUpdate = true;
                }

                if ($shouldUpdate) {
                    $bestR2           = $result['r2'];
                    $bestFeatures     = $features;
                    $bestCoefficients = $result['coefficients'];
                }
            }
        }

        if (empty($bestFeatures)) {
            return null;
        }

        $forecast = $this->generateForecast($bestFeatures, $bestCoefficients, $trainingData, $bestR2);

        if ($shouldStore && $forecast) {
            $this->storeResults($bestFeatures, $bestCoefficients, $bestR2, $forecast, $evaluationDate);
        }
        return [
            'features'        => $bestFeatures,
            'coefficients'    => $bestCoefficients,
            'r2'              => $bestR2,
            'forecast'        => $forecast,
            'evaluation_date' => $evaluationDate,
        ];
    }
    private function generateFeatureCombinations(): array {
        $combinations = [];

        $featureGroups = [
            'cashflow_acquisitions' => [],
            'cashflow_timebased'    => [],
            'cashflow_projects'     => [],
            'customer_revenue'      => [],
            'historical_revenue'    => [],
            'seasonal'              => [],
        ];

        foreach (self::PARAM_KEYS as $key) {
            $groupKey = strtolower(str_replace('CASHFLOW_', 'cashflow_', $key));

            $featureGroups[$groupKey][] = "{$key}_ma_3";
            $featureGroups[$groupKey][] = "{$key}_ma_6";
            $featureGroups[$groupKey][] = "{$key}_ma_12";

            for ($i = 0; $i < 3; $i++) {
                $featureGroups[$groupKey][] = "{$key}_abs_{$i}";
                $featureGroups[$groupKey][] = "{$key}_delta_{$i}";
            }
        }

        $featureGroups['customer_revenue'] = [
            'customer_revenue_sum', 'customer_revenue_avg', 'customer_revenue_count',
            'customer_revenue_ma_3', 'customer_revenue_ma_6', 'customer_revenue_ma_12',
            'customer_revenue_delta_3', 'customer_revenue_delta_6', 'customer_revenue_delta_12',
            'customer_revenue_growth_3m', 'customer_revenue_growth_6m',
        ];

        $featureGroups['historical_revenue'] = [
            'revenue_lag_3', 'revenue_lag_6', 'revenue_lag_12',
        ];

        $this->generateDiversifiedCombinations($combinations, $featureGroups);
        return $combinations;
    }
    private function generateDiversifiedCombinations(array &$combinations, array $featureGroups) {
        $featureGroups = array_filter($featureGroups, fn ($group) => ! empty($group));
        $groupNames    = array_keys($featureGroups);

        if (count($groupNames) < 2) {
            $this->warn('Not enough feature groups to generate diversified combinations');
            return;
        }

        for ($i = 0; $i < count($groupNames); $i++) {
            for ($j = $i + 1; $j < count($groupNames); $j++) {
                $group1 = $featureGroups[$groupNames[$i]];
                $group2 = $featureGroups[$groupNames[$j]];

                if (empty($group1) || empty($group2)) {
                    continue;
                }

                foreach (array_slice($group1, 0, 3) as $feature1) {
                    foreach (array_slice($group2, 0, 3) as $feature2) {
                        $combinations[] = [$feature1, $feature2];
                    }
                }
            }
        }

        if (count($groupNames) >= 3) {
            for ($i = 0; $i < count($groupNames); $i++) {
                for ($j = $i + 1; $j < count($groupNames); $j++) {
                    for ($k = $j + 1; $k < count($groupNames); $k++) {
                        $group1 = $featureGroups[$groupNames[$i]];
                        $group2 = $featureGroups[$groupNames[$j]];
                        $group3 = $featureGroups[$groupNames[$k]];

                        if (empty($group1) || empty($group2) || empty($group3)) {
                            continue;
                        }

                        foreach (array_slice($group1, 0, 2) as $feature1) {
                            foreach (array_slice($group2, 0, 2) as $feature2) {
                                foreach (array_slice($group3, 0, 2) as $feature3) {
                                    $combinations[] = [$feature1, $feature2, $feature3];
                                }
                            }
                        }
                    }
                }
            }
        }

        if (count($groupNames) >= 4) {
            $priorityGroups = array_intersect(['customer_revenue', 'historical_revenue', 'seasonal'], $groupNames);

            foreach ($priorityGroups as $baseGroup) {
                if (empty($featureGroups[$baseGroup])) {
                    continue;
                }

                $remaining = array_values(array_diff($groupNames, [$baseGroup]));

                if (count($remaining) >= 3) {
                    for ($i = 0; $i < count($remaining); $i++) {
                        for ($j = $i + 1; $j < count($remaining); $j++) {
                            for ($k = $j + 1; $k < count($remaining); $k++) {
                                if (empty($featureGroups[$remaining[$i]]) ||
                                    empty($featureGroups[$remaining[$j]]) ||
                                    empty($featureGroups[$remaining[$k]])) {
                                    continue;
                                }

                                $combinations[] = [
                                    $featureGroups[$baseGroup][0],
                                    $featureGroups[$remaining[$i]][0],
                                    $featureGroups[$remaining[$j]][0],
                                    $featureGroups[$remaining[$k]][0],
                                ];
                            }
                        }
                    }
                }
            }
        }
    }
    private function calculateLinearRegression(array $data, array $features): ?array {
        $n = count($data);
        if ($n < 2) {
            return null;
        }

        $X = [];
        $y = [];

        foreach ($data as $point) {
            $row        = [1]; // Intercept term
            $validPoint = true;

            foreach ($features as $feature) {
                $value = $this->extractFeatureValue($point, $feature);
                if ($value === null) {
                    $validPoint = false;
                    break;
                }
                $row[] = $value;
            }

            if ($validPoint) {
                $X[] = $row;
                $y[] = $point['dependent_y'];
            }
        }

        if (count($X) < 2) {
            return null;
        }

        // Calculate coefficients using normal equation: β = (X'X)^(-1)X'y
        $coefficients = $this->solveNormalEquation($X, $y);
        if (! $coefficients) {
            return null;
        }

        $r2 = $this->calculateR2($X, $y, $coefficients);
        return [
            'coefficients' => $coefficients,
            'r2'           => $r2,
            'n'            => count($X),
        ];
    }
    private function extractFeatureValue(array $point, string $feature): ?float {
        if (isset($point[$feature])) {
            return (float)$point[$feature];
        }

        if (strpos($feature, '_abs_') !== false || strpos($feature, '_delta_') !== false) {
            $parts = explode('_', $feature);
            $index = (int)array_pop($parts);
            $type  = array_pop($parts); // 'abs' or 'delta'
            $key   = implode('_', $parts);

            $arrayKey = "{$key}_{$type}";
            return $point[$arrayKey][$index] ?? null;
        }
        return null;
    }
    private function selectTopFeatures(): array {
        $features = [];

        $features[] = 'revenue_lag_3';
        $features[] = 'revenue_lag_6';
        $features[] = 'revenue_lag_12';

        $features[] = 'customer_revenue_sum';
        $features[] = 'customer_revenue_avg';
        $features[] = 'customer_revenue_count';
        $features[] = 'customer_revenue_median';
        $features[] = 'customer_revenue_ma_3';
        $features[] = 'customer_revenue_ma_6';
        $features[] = 'customer_revenue_ma_12';
        $features[] = 'customer_revenue_delta_3';
        $features[] = 'customer_revenue_delta_6';
        $features[] = 'customer_revenue_delta_12';
        $features[] = 'customer_revenue_growth_3m';
        $features[] = 'customer_revenue_growth_6m';

        foreach (self::PARAM_KEYS as $key) {
            $features[] = "{$key}_ma_3";
            $features[] = "{$key}_ma_6";
            $features[] = "{$key}_ma_12";
        }

        foreach (self::PARAM_KEYS as $key) {
            for ($i = 0; $i < 3; $i++) {
                $features[] = "{$key}_abs_{$i}";
                $features[] = "{$key}_delta_{$i}";
            }
        }
        return $features;
    }
    private function solveNormalEquation(array $X, array $y): ?array {
        $n = count($X);
        $p = count($X[0]);

        // Calculate X'X
        $XtX = [];
        for ($i = 0; $i < $p; $i++) {
            for ($j = 0; $j < $p; $j++) {
                $sum = 0;
                for ($k = 0; $k < $n; $k++) {
                    $sum += $X[$k][$i] * $X[$k][$j];
                }
                $XtX[$i][$j] = $sum;
            }
        }

        // Calculate X'y
        $Xty = [];
        for ($i = 0; $i < $p; $i++) {
            $sum = 0;
            for ($k = 0; $k < $n; $k++) {
                $sum += $X[$k][$i] * $y[$k];
            }
            $Xty[$i] = $sum;
        }

        return $this->gaussianElimination($XtX, $Xty);
    }
    private function gaussianElimination(array $A, array $b): ?array {
        $n = count($A);

        for ($i = 0; $i < $n; $i++) {
            $maxRow = $i;
            for ($k = $i + 1; $k < $n; $k++) {
                if (abs($A[$k][$i]) > abs($A[$maxRow][$i])) {
                    $maxRow = $k;
                }
            }

            if ($maxRow != $i) {
                [$A[$i], $A[$maxRow]] = [$A[$maxRow], $A[$i]];
                [$b[$i], $b[$maxRow]] = [$b[$maxRow], $b[$i]];
            }

            if (abs($A[$i][$i]) < 1e-10) {
                return null;
            }

            for ($k = $i + 1; $k < $n; $k++) {
                $factor = $A[$k][$i] / $A[$i][$i];
                for ($j = $i; $j < $n; $j++) {
                    $A[$k][$j] -= $factor * $A[$i][$j];
                }
                $b[$k] -= $factor * $b[$i];
            }
        }

        $x = array_fill(0, $n, 0);
        for ($i = $n - 1; $i >= 0; $i--) {
            $x[$i] = $b[$i];
            for ($j = $i + 1; $j < $n; $j++) {
                $x[$i] -= $A[$i][$j] * $x[$j];
            }
            $x[$i] /= $A[$i][$i];
        }
        return $x;
    }
    private function calculateR2(array $X, array $y, array $coefficients): float {
        $n     = count($y);
        $meanY = array_sum($y) / $n;

        $ssRes = 0; // Sum of squares of residuals
        $ssTot = 0; // Total sum of squares

        for ($i = 0; $i < $n; $i++) {
            $predicted = 0;
            for ($j = 0; $j < count($coefficients); $j++) {
                $predicted += $coefficients[$j] * $X[$i][$j];
            }

            $residual = $y[$i] - $predicted;
            $ssRes += $residual * $residual;

            $deviation = $y[$i] - $meanY;
            $ssTot += $deviation * $deviation;
        }
        return $ssTot > 0 ? 1 - ($ssRes / $ssTot) : 0;
    }
    private function outputResults(array $features, array $coefficients, float $r2, int $dataPoints): void {
        $this->info('=== LINEAR REGRESSION FORECAST RESULTS ===');
        $this->info("Data Points Used: {$dataPoints}");
        $this->info('R² (Coefficient of Determination): '.number_format($r2, 4));
        $this->info('Model Explains: '.number_format($r2 * 100, 2).'% of variance');

        $this->info("\nBest Feature Combination:");
        $this->info('Intercept: '.number_format($coefficients[0], 2));

        for ($i = 0; $i < count($features); $i++) {
            $coeff   = $coefficients[$i + 1];
            $feature = $features[$i];

            $this->info("  {$feature}: ".number_format($coeff, 6));
        }

        $this->info("\nModel Significance:");
        if ($r2 > 0.7) {
            $this->info('STRONG predictive power (R² > 0.7)');
        } elseif ($r2 > 0.5) {
            $this->info('MODERATE predictive power (R² > 0.5)');
        } elseif ($r2 > 0.3) {
            $this->info('WEAK predictive power (R² > 0.3)');
        } else {
            $this->warn('VERY WEAK predictive power (R² ≤ 0.3)');
        }
    }
    private function analyzeFeatureCorrelations(array $trainingData): void {
        $this->info('\nAnalyzing individual feature correlations...');

        $correlations = [];
        $features     = $this->selectTopFeatures();

        foreach ($features as $feature) {
            $correlation = $this->calculateCorrelation($trainingData, $feature);
            if ($correlation !== null) {
                $correlations[$feature] = abs($correlation);
            }
        }

        arsort($correlations);

        $this->info('Top 10 individual feature correlations:');
        $count = 0;
        foreach ($correlations as $feature => $correlation) {
            if ($count >= 10) {
                break;
            }
            $this->info(sprintf('  %s: %.4f', $feature, $correlation));
            $count++;
        }
    }
    private function calculateCorrelation(array $data, string $feature): ?float {
        $x = [];
        $y = [];

        foreach ($data as $point) {
            $featureValue = $this->extractFeatureValue($point, $feature);
            if ($featureValue !== null) {
                $x[] = $featureValue;
                $y[] = $point['dependent_y'];
            }
        }

        if (count($x) < 2) {
            return null;
        }

        $n     = count($x);
        $sumX  = array_sum($x);
        $sumY  = array_sum($y);
        $sumXY = 0;
        $sumX2 = 0;
        $sumY2 = 0;

        for ($i = 0; $i < $n; $i++) {
            $sumXY += $x[$i] * $y[$i];
            $sumX2 += $x[$i] * $x[$i];
            $sumY2 += $y[$i] * $y[$i];
        }

        $denominator = sqrt(($n * $sumX2 - $sumX * $sumX) * ($n * $sumY2 - $sumY * $sumY));

        if ($denominator == 0) {
            return null;
        }
        return ($n * $sumXY - $sumX * $sumY) / $denominator;
    }
    private function outputEnhancedResults(array $bestFeatures, array $bestCoefficients, float $bestR2, array $topResults, int $dataPoints): void {
        $this->info('\n=== LINEAR REGRESSION FORECAST RESULTS ===');
        $this->info('R²: '.number_format($bestR2, 4)." ({$dataPoints} data points, ".number_format($bestR2 * 100, 1).'% variance explained)');

        if ($bestR2 > 0.7) {
            $this->info('Model Performance: STRONG');
        } elseif ($bestR2 > 0.5) {
            $this->info('Model Performance: MODERATE');
        } elseif ($bestR2 > 0.3) {
            $this->info('Model Performance: WEAK');
        } else {
            $this->warn('Model Performance: VERY WEAK');
        }

        $this->info('Features: '.implode(', ', $bestFeatures));
    }
    private function categorizeFeatures(array $features, array $coefficients): void {
        $seasonal   = [];
        $historical = [];
        $trends     = [];
        $customer   = [];
        $other      = [];

        for ($i = 0; $i < count($features); $i++) {
            $feature = $features[$i];
            $coeff   = $coefficients[$i + 1];
            $impact  = ['feature' => $feature, 'coefficient' => $coeff, 'direction' => $coeff > 0 ? 'Positive' : 'Negative'];

            if (false) { // Seasonal features removed
                $seasonal[] = $impact;
            } elseif (strpos($feature, 'revenue_lag') !== false) {
                $historical[] = $impact;
            } elseif (strpos($feature, 'customer_revenue') !== false) {
                $customer[] = $impact;
            } elseif (strpos($feature, '_ma_') !== false) {
                $trends[] = $impact;
            } else {
                $other[] = $impact;
            }
        }

        if (! empty($seasonal)) {
            $this->info('Seasonal Factors:');
            foreach ($seasonal as $impact) {
                $this->info(sprintf('   %s (%s impact): %s', $impact['feature'], $impact['direction'], number_format($impact['coefficient'], 6)));
            }
        }

        if (! empty($historical)) {
            $this->info('Historical Revenue Factors:');
            foreach ($historical as $impact) {
                $this->info(sprintf('   %s (%s impact): %s', $impact['feature'], $impact['direction'], number_format($impact['coefficient'], 6)));
            }
        }

        if (! empty($customer)) {
            $this->info('Customer Revenue Indicators:');
            foreach ($customer as $impact) {
                $this->info(sprintf('   %s (%s impact): %s', $impact['feature'], $impact['direction'], number_format($impact['coefficient'], 6)));
            }
        }

        if (! empty($trends)) {
            $this->info('Trend Indicators (Moving Averages):');
            foreach ($trends as $impact) {
                $this->info(sprintf('   %s (%s impact): %s', $impact['feature'], $impact['direction'], number_format($impact['coefficient'], 6)));
            }
        }

        if (! empty($other)) {
            $this->info('Other Factors:');
            foreach ($other as $impact) {
                $this->info(sprintf('   %s (%s impact): %s', $impact['feature'], $impact['direction'], number_format($impact['coefficient'], 6)));
            }
        }
    }
    private function provideRecommendations(float $r2, array $features): void {
        if ($r2 > 0.7) {
            $this->info('Model shows strong predictive capability. Consider using for forecasting.');
        } elseif ($r2 > 0.5) {
            $this->info('Model shows moderate predictive capability. Consider:');
            $this->info('   - Adding more historical data if available');
            $this->info('   - Including additional business metrics');
            $this->info('   - Checking for data quality issues');
        } else {
            $this->info('Model shows weak predictive capability. Recommendations:');
            $this->info('   - Review data quality and completeness');
            $this->info('   - Consider non-linear modeling approaches');
            $this->info('   - Include external economic indicators');
            $this->info('   - Analyze for outliers or structural breaks');
        }

        $hasSeasonality     = false; // Seasonal features removed
        $hasTrends          = ! empty(array_filter($features, fn ($f) => strpos($f, '_ma_') !== false));
        $hasLagged          = ! empty(array_filter($features, fn ($f) => strpos($f, 'revenue_lag') !== false));
        $hasCustomerRevenue = ! empty(array_filter($features, fn ($f) => strpos($f, 'customer_revenue') !== false));

        $this->info('\nFeature Mix Analysis:');
        $this->info('   Trend indicators: '.($hasTrends ? 'Included' : 'Missing'));
        $this->info('   Historical revenue: '.($hasLagged ? 'Included' : 'Missing'));
        $this->info('   Customer revenue data: '.($hasCustomerRevenue ? 'Included' : 'Missing'));

        $featureTypes = [];
        if ($hasTrends) {
            $featureTypes[] = 'trends';
        }
        if ($hasLagged) {
            $featureTypes[] = 'historical';
        }
        if ($hasCustomerRevenue) {
            $featureTypes[] = 'customer';
        }

        $diversification = count($featureTypes);
        $this->info('   Feature diversification: '.$diversification.'/3 types (seasonal removed)');

        if ($diversification >= 3) {
            $this->info('   ✅ Well-diversified feature set - reduces overfitting risk');
        } elseif ($diversification === 2) {
            $this->info('   ⚠️  Moderately diversified - consider adding more feature types');
        } else {
            $this->info('   ❌ Low diversification - high overfitting risk');
        }
    }
    private function displayPredictionFormula(array $features, array $coefficients): void {
        $formula = 'predicted_revenue = '.number_format($coefficients[0], 2);

        for ($i = 0; $i < count($features); $i++) {
            $coeff    = $coefficients[$i + 1];
            $feature  = $features[$i];
            $sign     = $coeff >= 0 ? ' + ' : ' - ';
            $absCoeff = abs($coeff);

            $formula .= $sign.number_format($absCoeff, 6).' * ['.$feature.']';
        }

        $this->info($formula);

        $this->info("\nWhere:");
        $this->info('  C (base factor) = '.number_format($coefficients[0], 2));
        for ($i = 0; $i < count($features); $i++) {
            $coeff   = $coefficients[$i + 1];
            $feature = $features[$i];
            $this->info('  ['.$feature.'] impact = '.number_format($coeff, 6));
        }
    }
    private function generateForecast(array $features, array $coefficients, array $trainingData = [], float $r2 = 0): ?array {
        $this->info("\n=== 12-MONTH FORECAST ===");

        try {
            $currentMonth = Carbon::now()->subYear();
            $currentData  = null;
            $attempts     = 0;

            while (! $currentData && $attempts < 6) {
                $testMonth   = $currentMonth->copy()->subMonths($attempts);
                $currentData = $this->collectMonthData($testMonth);
                if ($currentData) {
                    break;
                }
                $attempts++;
            }

            if (! $currentData && ! empty($trainingData)) {
                $currentData = end($trainingData);
            }

            if (! $currentData) {
                $this->warn('Cannot generate forecast: no data available');
                return null;
            }

            $prediction = $coefficients[0]; // Base factor C

            for ($i = 0; $i < count($features); $i++) {
                $feature = $features[$i];
                $coeff   = $coefficients[$i + 1];
                $value   = $this->extractFeatureValue($currentData, $feature);

                if ($value !== null) {
                    $contribution = $coeff * $value;
                    $prediction += $contribution;
                }
            }

            $this->info('Predicted 12-month revenue: €'.number_format($prediction, 0));

            $confidenceIntervals = $this->calculateConfidenceIntervals($prediction, $features, $coefficients, $trainingData, $r2);

            $this->info(sprintf('95%% confidence: €%s - €%s',
                number_format($confidenceIntervals['ci_95_lower'], 0),
                number_format($confidenceIntervals['ci_95_upper'], 0)
            ));

            return [
                'prediction'           => $prediction,
                'confidence_intervals' => $confidenceIntervals,
                'r2'                   => $r2,
                'features'             => $features,
                'coefficients'         => $coefficients,
            ];
        } catch (Exception $e) {
            $this->error('Error generating forecast: '.$e->getMessage());
            return null;
        }
    }
    private function calculateConfidenceIntervals(float $prediction, array $features, array $coefficients, array $trainingData, float $r2): array {
        $n = count($trainingData);
        $p = count($features) + 1; // +1 for intercept

        if ($n <= $p) {
            $standardError = abs($prediction) * (1 - $r2) * 0.5; // Rough estimate
        } else {
            $actualValues = array_column($trainingData, 'dependent_y');
            $meanActual   = array_sum($actualValues) / count($actualValues);

            $sumSquaredErrors = 0;
            foreach ($trainingData as $dataPoint) {
                $predicted = $coefficients[0];
                for ($i = 0; $i < count($features); $i++) {
                    $featureValue = $this->extractFeatureValue($dataPoint, $features[$i]);
                    if ($featureValue !== null) {
                        $predicted += $coefficients[$i + 1] * $featureValue;
                    }
                }

                $error = $dataPoint['dependent_y'] - $predicted;
                $sumSquaredErrors += $error * $error;
            }

            // Residual standard error
            $residualStandardError = sqrt($sumSquaredErrors / ($n - $p));

            // Standard error of prediction (simplified - assumes prediction point is average)
            $standardError = $residualStandardError * sqrt(1 + (1 / $n));
        }

        $degreesOfFreedom = max(1, $n - $p);
        $t_68             = $this->getTCriticalValue(0.32, $degreesOfFreedom); // 68% CI (1 - 0.68 = 0.32)
        $t_95             = $this->getTCriticalValue(0.05, $degreesOfFreedom); // 95% CI (1 - 0.95 = 0.05)
        $t_99             = $this->getTCriticalValue(0.01, $degreesOfFreedom); // 99% CI (1 - 0.99 = 0.01)
        return [
            'standard_error' => $standardError,
            'ci_68_lower'    => $prediction - ($t_68 * $standardError),
            'ci_68_upper'    => $prediction + ($t_68 * $standardError),
            'ci_95_lower'    => $prediction - ($t_95 * $standardError),
            'ci_95_upper'    => $prediction + ($t_95 * $standardError),
            'ci_99_lower'    => $prediction - ($t_99 * $standardError),
            'ci_99_upper'    => $prediction + ($t_99 * $standardError),
        ];
    }
    private function getTCriticalValue(float $alpha, int $df): float {

        if ($df >= 30) {
            if ($alpha <= 0.01) {
                return 2.576;
            } // 99% CI
            if ($alpha <= 0.05) {
                return 1.960;
            } // 95% CI
            if ($alpha <= 0.32) {
                return 1.000;
            } // 68% CI
        } else {
            if ($alpha <= 0.01) {
                if ($df <= 5) {
                    return 4.032;
                }
                if ($df <= 10) {
                    return 3.169;
                }
                if ($df <= 20) {
                    return 2.845;
                }
                return 2.704; // df > 20
            }
            if ($alpha <= 0.05) {
                if ($df <= 5) {
                    return 2.571;
                }
                if ($df <= 10) {
                    return 2.228;
                }
                if ($df <= 20) {
                    return 2.086;
                }
                return 2.042; // df > 20
            }
            if ($alpha <= 0.32) {
                if ($df <= 5) {
                    return 1.476;
                }
                if ($df <= 10) {
                    return 1.372;
                }
                if ($df <= 20) {
                    return 1.325;
                }
                return 1.311; // df > 20
            }
        }
        return 1.960; // Default fallback
    }
    private function calculateDiversityScore(array $features): float {
        if (empty($features)) {
            return 0;
        }

        $sourceTypes = [];

        foreach ($features as $feature) {
            if (strpos($feature, 'CASHFLOW_PROJECTS_ACQUISITIONS') !== false) {
                $sourceTypes['acquisitions'] = true;
            } elseif (strpos($feature, 'CASHFLOW_PROJECTS_TIMEBASED') !== false) {
                $sourceTypes['timebased'] = true;
            } elseif (strpos($feature, 'CASHFLOW_PROJECTS') !== false &&
                      strpos($feature, 'ACQUISITIONS') === false &&
                      strpos($feature, 'TIMEBASED') === false) {
                $sourceTypes['projects'] = true;
            } elseif (strpos($feature, 'customer_revenue') !== false) {
                $sourceTypes['customer'] = true;
            } elseif (strpos($feature, 'revenue_lag') !== false) {
                $sourceTypes['historical'] = true;
            }
        }

        $diversityCount = count($sourceTypes);
        $featureCount   = count($features);

        $score = $diversityCount;
        if ($featureCount >= 3) {
            $score += 0.5; // Bonus for having 3+ features
        }
        return $score;
    }
    private function storeResults(array $features, array $coefficients, float $r2, ?array $forecast, ?Carbon $evaluationDate = null) {
        if (! $forecast) {
            $this->warn('Cannot store results: forecast generation failed');
            return;
        }

        try {
            $formula = 'predicted_revenue = '.number_format($coefficients[0], 2);
            for ($i = 0; $i < count($features); $i++) {
                $coeff    = $coefficients[$i + 1];
                $sign     = $coeff >= 0 ? ' + ' : ' - ';
                $absCoeff = abs($coeff);
                $formula .= $sign.number_format($absCoeff, 6).' * ['.$features[$i].']';
            }

            $formulaDetails = $formula."\n\nFeatures:\n";
            $formulaDetails .= 'Base factor (C): '.number_format($coefficients[0], 2)."\n";
            for ($i = 0; $i < count($features); $i++) {
                $coeff = $coefficients[$i + 1];
                $formulaDetails .= $features[$i].': '.number_format($coeff, 6)."\n";
            }
            $formulaDetails .= "\nModel Performance:\n";
            $formulaDetails .= 'R² = '.number_format($r2, 4).' ('.number_format($r2 * 100, 2)."% variance explained)\n";
            $formulaDetails .= 'Standard Error = '.number_format($forecast['confidence_intervals']['standard_error'], 2)."\n";
            $formulaDetails .= "\nConfidence Intervals (Frontend Calculation):\n";
            $formulaDetails .= "68% CI = prediction ± (1.0 * standard_error)\n";
            $formulaDetails .= "95% CI = prediction ± (1.96 * standard_error)\n";
            $formulaDetails .= "99% CI = prediction ± (2.58 * standard_error)\n";
            $generatedTime = $evaluationDate ?: Carbon::now();
            $formulaDetails .= "\nGenerated: ".$generatedTime->format('Y-m-d H:i:s');

            $this->storeParam('STATS_LINREG_FORMULA', $formulaDetails, $evaluationDate);

            $ci = $forecast['confidence_intervals'];
            $this->storeParam('STATS_LINREG_FORECAST_12M', $forecast['prediction'], $evaluationDate);
            $this->storeParam('STATS_LINREG_STANDARD_ERROR', $ci['standard_error'], $evaluationDate);
            $this->storeParam('STATS_LINREG_R2', $r2, $evaluationDate);
        } catch (Exception $e) {
            $this->error('Error storing results: '.$e->getMessage());
        }
    }
    private function storeParam(string $key, $value, ?Carbon $timestamp = null) {
        $param = Param::get($key);
        if ($timestamp) {
            $param->created_at = $timestamp;
            $param->updated_at = $timestamp;
        }
        $param->value = $value;
        $param->save();
    }
    private function generateCompanyForecasts(Carbon $evaluationDate): void {
        $revenueParam = Param::where('key', 'INVOICE_REVENUE_12M')->first();
        if (! $revenueParam) {
            return;
        }

        $activeCompanyIds = FloatParam::where('param_id', $revenueParam->id)
            ->where('parent_type', Company::class)
            ->whereNotNull('parent_id')
            ->whereBetween('created_at', [
                $evaluationDate->copy()->subYear()->startOfMonth(),
                $evaluationDate->copy(),
            ])
            ->where('value', '>', 0)
            ->distinct()
            ->pluck('parent_id');

        $this->info("Generating forecasts for {$activeCompanyIds->count()} active companies...");

        foreach ($activeCompanyIds as $companyId) {
            $company = Company::find($companyId);
            if (! $company) {
                continue;
            }

            $forecast = $this->forecastCompanyRevenue($company, $evaluationDate);
            if ($forecast !== null) {
                $param             = $company->param('STATS_LINREG_FORECAST_12M');
                $param->created_at = $evaluationDate;
                $param->updated_at = $evaluationDate;
                $param->value      = $forecast;
                $param->save();
            }
        }
    }
    private function forecastCompanyRevenue(Company $company, Carbon $evaluationDate): ?float {
        $allInvoices = Invoice::where('company_id', $company->id)
            ->whereBetween('created_at', [
                $evaluationDate->copy()->subYears(8),
                $evaluationDate,
            ])
            ->get(['created_at', 'net']);

        $rev12M = function (Carbon $asOf) use ($allInvoices): float {
            $from = $asOf->copy()->subYear();
            $to   = $asOf->copy();
            return $allInvoices
                ->filter(fn ($inv) => $inv->created_at >= $from && $inv->created_at <= $to)
                ->sum('net');
        };

        $endDate      = $evaluationDate->copy()->subYear();
        $startDate    = $endDate->copy()->subYears(5);
        $trainingData = [];
        $current      = $startDate->copy();

        while ($current->lt($endDate)) {
            $futurePoint = $current->copy()->addMonths(12);
            if ($futurePoint->gt($evaluationDate)) {
                $current->addMonth();

                continue;
            }

            $trainingData[] = [
                'dependent_y' => $rev12M($futurePoint),
                'lag_3'       => $rev12M($current->copy()->subMonths(3)),
                'lag_6'       => $rev12M($current->copy()->subMonths(6)),
                'lag_12'      => $rev12M($current->copy()->subMonths(12)),
            ];

            $current->addMonth();
        }

        if (count($trainingData) < 12) {
            return null;
        }

        $result = $this->calculateLinearRegression($trainingData, ['lag_3', 'lag_6', 'lag_12']);
        if (! $result) {
            return null;
        }

        $coefficients = $result['coefficients'];
        $prediction   = $coefficients[0]
            + $coefficients[1] * $rev12M($evaluationDate->copy()->subMonths(3))
            + $coefficients[2] * $rev12M($evaluationDate->copy()->subMonths(6))
            + $coefficients[3] * $rev12M($evaluationDate->copy()->subMonths(12));
        return max(0.0, $prediction);
    }
    private function info(string $message): void {
        if ($this->console) {
            $this->console->info($message);
        }
    }
    private function warn(string $message): void {
        if ($this->console) {
            $this->console->warn($message);
        }
    }
    private function error(string $message): void {
        if ($this->console) {
            $this->console->error($message);
        }
    }
}
