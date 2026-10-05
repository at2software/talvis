<?php

namespace App\ML;

use App\Models\Company;
use App\Models\Invoice;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Rubix\ML\CrossValidation\Metrics\MeanAbsoluteError;
use Rubix\ML\CrossValidation\Metrics\RMSE;
use Rubix\ML\CrossValidation\Metrics\RSquared;
use Rubix\ML\CrossValidation\Metrics\SMAPE;
use Rubix\ML\Datasets\Labeled;
use Rubix\ML\Datasets\Unlabeled;
use Rubix\ML\Learner;
use Rubix\ML\PersistentModel;
use Rubix\ML\Persisters\Filesystem;
use Rubix\ML\Pipeline;
use Rubix\ML\Regressors\GradientBoost;
use Rubix\ML\Regressors\KNNRegressor;
use Rubix\ML\Regressors\RegressionTree;
use Rubix\ML\Regressors\Ridge;
use Rubix\ML\Transformers\MissingDataImputer;
use Rubix\ML\Transformers\NumericStringConverter;
use Rubix\ML\Transformers\ZScaleStandardizer;

/**
 * Model B — re-purchase interval prediction ("when to contact again"). Trains
 * on CustomerIntervalDataset::FEATURES to predict log(next_gap_days + 1),
 * compared against the naive "historical mean gap" baseline (predict next
 * interval = mean of the customer's own past inter-purchase gaps).
 *
 * No categorical features, so the pipeline skips OneHotEncoder (like
 * ProjectEarlyWarningModel / CustomerRevenueModel).
 */
class CustomerIntervalModel {
    private const MODEL_PATH = 'ml/customer_interval.rbx';

    /** @return array<string, callable(): Learner> */
    public static function candidates(): array {
        return [
            'Ridge'          => fn () => new Ridge,
            'KNNRegressor'   => fn () => new KNNRegressor(5),
            'RegressionTree' => fn () => new RegressionTree,
            'GradientBoost'  => fn () => new GradientBoost,
        ];
    }

    public static function pipeline(Learner $estimator): Pipeline {
        return new Pipeline([
            new NumericStringConverter,
            new MissingDataImputer,
            new ZScaleStandardizer,
        ], $estimator);
    }
    public static function toSample(array $row): array {
        return [
            $row['mean_gap_days'] === null ? NAN : (float)$row['mean_gap_days'],
            $row['median_gap_days'] === null ? NAN : (float)$row['median_gap_days'],
            $row['gap_stddev_days'] === null ? NAN : (float)$row['gap_stddev_days'],
            (float)$row['purchase_count_to_date'],
            (float)$row['days_since_last_purchase'],
            (float)$row['tenure_days'],
            (float)$row['last_gap_days'],
        ];
    }

    /**
     * Grouped k-fold cross-validation: snapshots from the same company are
     * correlated (they share purchase history), so folds are split by
     * `company_id`, not by row. Mirrors ProjectEarlyWarningModel::evaluate() /
     * CustomerRevenueModel::evaluate().
     *
     * @param list<array<string, mixed>> $rows CustomerIntervalDataset::extractRow() output
     * @return array{n: int, companies: int, k: int, baseline: array<string, float>, estimators: array<string, array<string, float>>}
     */
    public static function evaluate(array $rows, int $folds = 5): array {
        $rowsByCompany = [];
        foreach ($rows as $row) {
            $rowsByCompany[$row['company_id']][] = $row;
        }
        $companyIds = array_keys($rowsByCompany);
        shuffle($companyIds);
        $foldGroups = array_chunk($companyIds, (int)ceil(count($companyIds) / $folds));

        $actual              = [];
        $baselinePredictions = [];
        $modelPredictions    = array_fill_keys(array_keys(self::candidates()), []);

        foreach ($foldGroups as $testCompanyIds) {
            $testSet = array_flip($testCompanyIds);

            $trainRows = [];
            foreach ($rowsByCompany as $companyId => $companyRows) {
                if (! isset($testSet[$companyId])) {
                    array_push($trainRows, ...$companyRows);
                }
            }
            $testRows = [];
            foreach ($testCompanyIds as $companyId) {
                array_push($testRows, ...$rowsByCompany[$companyId]);
            }

            $trainSamples = array_map(fn ($row) => self::toSample($row), $trainRows);
            $trainLabels  = array_map(fn ($row) => CustomerIntervalDataset::logLabel($row[CustomerIntervalDataset::LABEL]), $trainRows);
            $training     = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testRows as $row) {
                $testSamples[]         = self::toSample($row);
                $actual[]              = $row[CustomerIntervalDataset::LABEL];
                $baselinePredictions[] = max(0.0, (float)($row['mean_gap_days'] ?? 0.0));
            }
            $testing = Unlabeled::build($testSamples);

            foreach (self::candidates() as $name => $factory) {
                $pipeline = self::pipeline($factory());
                $pipeline->train($training);

                foreach ($pipeline->predict($testing) as $logPrediction) {
                    $modelPredictions[$name][] = max(0.0, exp($logPrediction) - 1);
                }
            }
        }

        $metrics = [
            'mae'   => new MeanAbsoluteError,
            'rmse'  => new RMSE,
            'r2'    => new RSquared,
            'smape' => new SMAPE,
        ];
        // See ProjectHoursModel::evaluate() for why MAE/RMSE/SMAPE are negated by Rubix.
        $score = function (array $predictions) use ($metrics, $actual): array {
            $scores = [];
            foreach ($metrics as $key => $metric) {
                $value        = $metric->score($predictions, $actual);
                $scores[$key] = $key === 'r2' ? $value : -$value;
            }
            return $scores;
        };

        $result = [
            'n'          => count($rows),
            'companies'  => count($companyIds),
            'k'          => count($foldGroups),
            'baseline'   => $score($baselinePredictions),
            'estimators' => [],
        ];
        foreach ($modelPredictions as $name => $predictions) {
            $result['estimators'][$name] = $score($predictions);
        }
        return $result;
    }

    public static function train(array $rows, Learner $estimator): PersistentModel {
        $samples = array_map(fn ($row) => self::toSample($row), $rows);
        $labels  = array_map(fn ($row) => CustomerIntervalDataset::logLabel($row[CustomerIntervalDataset::LABEL]), $rows);

        $path = storage_path('app/'.self::MODEL_PATH);
        if (! is_dir(dirname($path))) {
            mkdir(dirname($path), 0755, true);
        }

        $model = new PersistentModel(self::pipeline($estimator), new Filesystem($path));
        $model->train(Labeled::build($samples, $labels));
        $model->save();

        return $model;
    }
    public static function load(): ?PersistentModel {
        $path = storage_path('app/'.self::MODEL_PATH);
        if (! is_file($path)) {
            return null;
        }
        return PersistentModel::load(new Filesystem($path));
    }
    public static function predictIntervalDays(Company $company): ?float {
        $model = self::load();
        if (! $model) {
            return null;
        }

        $invoices  = CustomerSnapshots::invoicesFor($company);
        $purchases = CustomerIntervalDataset::purchaseEvents($invoices);
        if ($purchases->count() < CustomerIntervalDataset::MIN_PRIOR_PURCHASES) {
            return null;
        }

        $row = self::currentRow($company, $purchases);
        if ($row === null) {
            return null;
        }

        $sample        = self::toSample($row);
        $logPrediction = $model->predict(Unlabeled::build([$sample]))[0];

        return max(0.0, exp($logPrediction) - 1);
    }
    public static function predictNextPurchaseAt(Company $company): ?Carbon {
        $days = self::predictIntervalDays($company);
        if ($days === null) {
            return null;
        }

        $invoices       = CustomerSnapshots::invoicesFor($company);
        $purchases      = CustomerIntervalDataset::purchaseEvents($invoices);
        $lastPurchaseAt = Carbon::parse($purchases->last()->created_at);

        return $lastPurchaseAt->copy()->addDays((int)round($days));
    }

    /**
     * A "current" feature row (no label — there's no known next purchase yet),
     * built the same way as CustomerIntervalDataset::extractRow() but for
     * "now" as the cutoff instead of a historical snapshot.
     *
     * @param Collection<int, Invoice> $purchases
     */
    private static function currentRow(Company $company, Collection $purchases): ?array {
        $dates = $purchases->map(fn ($i) => Carbon::parse($i->created_at))->values();
        if ($dates->count() < CustomerIntervalDataset::MIN_PRIOR_PURCHASES) {
            return null;
        }

        $gaps = CustomerSnapshots::consecutiveGaps($dates);

        $now    = now();
        $mean   = CustomerSnapshots::meanGap($gaps);
        $median = CustomerSnapshots::median($gaps);
        $stddev = CustomerSnapshots::stddev($gaps, $mean);

        return [
            'mean_gap_days'            => $mean,
            'median_gap_days'          => $median,
            'gap_stddev_days'          => $stddev,
            'purchase_count_to_date'   => $dates->count(),
            // See CustomerIntervalDataset::extractRow() — diffInDays() is signed and
            // argument order matters (dates here are before $now).
            'days_since_last_purchase' => $dates->last()->diffInDays($now),
            'tenure_days'              => $dates->first()->diffInDays($now),
            'last_gap_days'            => $gaps[count($gaps) - 1],
        ];
    }
}
