<?php

namespace App\ML;

use App\Models\Company;
use Rubix\ML\Classifiers\ClassificationTree;
use Rubix\ML\Classifiers\GaussianNB;
use Rubix\ML\Classifiers\KNearestNeighbors;
use Rubix\ML\Classifiers\LogisticRegression;
use Rubix\ML\Classifiers\RandomForest;
use Rubix\ML\CrossValidation\Metrics\Accuracy;
use Rubix\ML\CrossValidation\Metrics\FBeta;
use Rubix\ML\CrossValidation\Metrics\MCC;
use Rubix\ML\Datasets\Labeled;
use Rubix\ML\Datasets\Unlabeled;
use Rubix\ML\Learner;
use Rubix\ML\PersistentModel;
use Rubix\ML\Persisters\Filesystem;
use Rubix\ML\Pipeline;
use Rubix\ML\Transformers\MissingDataImputer;
use Rubix\ML\Transformers\NumericStringConverter;
use Rubix\ML\Transformers\ZScaleStandardizer;

/**
 * Model C — customer churn classification. Trains on CustomerChurnDataset::FEATURES
 * to predict the binary label "churned" (no purchase in the next 12 months),
 * compared against a naive recency baseline: predict churned iff the customer
 * hasn't purchased in over a year (days_since_last_purchase > 365).
 *
 * Classifiers only (all Probabilistic so predict() can return a churn
 * probability). Grouped k-fold CV by company_id, same leakage discipline as
 * Models A/B. The "1" (churned) class is the minority/positive class, so
 * headline metrics are F1 + MCC (imbalance-robust), not raw accuracy.
 */
class CustomerChurnModel {
    private const MODEL_PATH           = 'ml/customer_churn.rbx';
    public const BASELINE_RECENCY_DAYS = 365;
    public const CHURNED               = 1;

    /**
     * @return array<string, callable(): Learner>
     */
    public static function candidates(): array {
        return [
            'LogisticRegression'   => fn () => new LogisticRegression,
            'KNearestNeighbors'    => fn () => new KNearestNeighbors(5),
            'ClassificationTree'   => fn () => new ClassificationTree,
            'RandomForestBalanced' => fn () => new RandomForest(new ClassificationTree, 100, 0.2, true),
            'GaussianNBUniform'    => fn () => new GaussianNB(['0' => 0.5, '1' => 0.5]),
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
            (float)$row['days_since_last_purchase'],
            $row['mean_gap_days'] === null ? NAN : (float)$row['mean_gap_days'],
            $row['median_gap_days'] === null ? NAN : (float)$row['median_gap_days'],
            $row['gap_stddev_days'] === null ? NAN : (float)$row['gap_stddev_days'],
            (float)$row['last_gap_days'],
            (float)$row['purchase_count_to_date'],
            (float)$row['purchase_count_trailing_12m'],
            (float)$row['tenure_days'],
            $row['recency_over_mean_gap'] === null ? NAN : (float)$row['recency_over_mean_gap'],
        ];
    }
    public static function label(array $row): string {
        return (string)$row[CustomerChurnDataset::LABEL];
    }

    /**
     * Grouped k-fold cross-validation: snapshots from the same company are
     * correlated, so folds are split by company_id, never by row (mirrors the
     * regression models). Every candidate classifier, plus the naive recency
     * baseline, is scored on the SAME out-of-fold predictions.
     *
     * @param list<array<string, mixed>> $rows CustomerChurnDataset::extractRow() output
     * @return array{n: int, companies: int, k: int, positives: int, positive_rate: float, baseline: array<string, float>, estimators: array<string, array<string, float>>}
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
            $trainLabels  = array_map(fn ($row) => self::label($row), $trainRows);
            $training     = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testRows as $row) {
                $testSamples[]         = self::toSample($row);
                $actual[]              = self::label($row);
                $baselinePredictions[] = (string)($row['days_since_last_purchase'] > self::BASELINE_RECENCY_DAYS ? 1 : 0);
            }
            $testing = Unlabeled::build($testSamples);

            foreach (self::candidates() as $name => $factory) {
                $pipeline = self::pipeline($factory());
                $pipeline->train($training);
                foreach ($pipeline->predict($testing) as $prediction) {
                    $modelPredictions[$name][] = (string)$prediction;
                }
            }
        }

        $positives = count(array_filter($actual, fn ($label) => $label === (string)self::CHURNED));

        $result = [
            'n'             => count($rows),
            'companies'     => count($companyIds),
            'k'             => count($foldGroups),
            'positives'     => $positives,
            'positive_rate' => count($actual) > 0 ? $positives / count($actual) : 0.0,
            'baseline'      => self::score($baselinePredictions, $actual),
            'estimators'    => [],
        ];
        foreach ($modelPredictions as $name => $predictions) {
            $result['estimators'][$name] = self::score($predictions, $actual);
        }
        return $result;
    }

    /**
     * @param string[] $predictions
     * @param string[] $actual
     * @return array<string, float>
     */
    private static function score(array $predictions, array $actual): array {
        $pos = (string)self::CHURNED;
        $tp  = $fp = $fn = 0;
        foreach ($predictions as $i => $prediction) {
            $isPredPos = $prediction === $pos;
            $isRealPos = $actual[$i] === $pos;
            if ($isPredPos && $isRealPos) {
                $tp++;
            } elseif ($isPredPos && ! $isRealPos) {
                $fp++;
            } elseif (! $isPredPos && $isRealPos) {
                $fn++;
            }
        }
        $precision = ($tp + $fp) > 0 ? $tp / ($tp + $fp) : 0.0;
        $recall    = ($tp + $fn) > 0 ? $tp / ($tp + $fn) : 0.0;
        $f1        = ($precision + $recall) > 0 ? 2 * $precision * $recall / ($precision + $recall) : 0.0;

        return [
            'accuracy'  => (new Accuracy)->score($predictions, $actual),
            'f1'        => $f1,
            'macro_f1'  => (new FBeta)->score($predictions, $actual),
            'mcc'       => (new MCC)->score($predictions, $actual),
            'precision' => $precision,
            'recall'    => $recall,
        ];
    }

    public static function train(array $rows, Learner $estimator): PersistentModel {
        $samples = array_map(fn ($row) => self::toSample($row), $rows);
        $labels  = array_map(fn ($row) => self::label($row), $rows);

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
    public static function predict(Company $company): ?float {
        $model = self::load();
        if (! $model) {
            return null;
        }

        $invoices  = CustomerSnapshots::invoicesFor($company);
        $purchases = CustomerIntervalDataset::purchaseEvents($invoices);
        if ($purchases->count() < CustomerChurnDataset::MIN_PRIOR_PURCHASES) {
            return null;
        }

        $row    = CustomerChurnDataset::extractRow($company, $purchases, now());
        $sample = self::toSample($row);

        $proba = $model->proba(Unlabeled::build([$sample]))[0];
        return (float)($proba[(string)self::CHURNED] ?? 0.0);
    }
}
