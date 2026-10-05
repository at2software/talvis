<?php

namespace App\ML;

use App\Models\Company;
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
 * Model A — customer 12-month revenue regression. Trains on
 * CustomerRevenueDataset::FEATURES to predict log(revenue_next_12m + 1),
 * compared against the naive "persistence" baseline (predict next 12m =
 * trailing 12m revenue at the cutoff).
 *
 * Strictly ADDITIVE to the existing STATS_LINREG_FORECAST_12M (ForecastService)
 * / INVOICE_REVENUE_12M params, which this does not read, write, or replace —
 * see companies.ml_predicted_revenue_12m, a separate column.
 *
 * No categorical features (unlike ProjectHoursModel's product_id), so the
 * pipeline skips OneHotEncoder, like ProjectEarlyWarningModel.
 */
class CustomerRevenueModel {
    private const MODEL_PATH = 'ml/customer_revenue.rbx';

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

    /**
     * Deliberately reads only the "Phase 1" 9 columns of
     * CustomerRevenueDataset::FEATURES, not trailing_6m_revenue /
     * revenue_growth_ratio — measured on real data, adding them made every
     * estimator slightly WORSE (KNN MAE 6682→6811), mirroring
     * ProjectHoursModel's decision to ignore its Phase-2 history features.
     * See CustomerRevenueDataset::FEATURES' docblock and
     * docs/ml/customer-revenue-plan.md.
     */
    public static function toSample(array $row): array {
        return [
            (float)$row['trailing_12m_revenue'],
            (float)$row['trailing_24m_revenue'],
            (float)$row['lifetime_revenue_to_date'],
            (float)$row['invoice_count_to_date'],
            (float)$row['invoice_count_trailing_12m'],
            (float)$row['avg_invoice_net_lifetime'],
            (float)$row['tenure_days'],
            (float)$row['days_since_last_invoice'],
            (float)$row['distinct_product_count_to_date'],
        ];
    }

    /**
     * Grouped k-fold cross-validation: multiple snapshots from the same company
     * are correlated (they share invoice history), so folds are split by
     * `company_id`, not by row, or the model would partly "see" a company's own
     * trajectory during training and CV scores would be optimistic. Mirrors
     * ProjectEarlyWarningModel::evaluate().
     *
     * @param list<array<string, mixed>> $rows CustomerRevenueDataset::extractRow() output
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
            $trainLabels  = array_map(fn ($row) => CustomerRevenueDataset::logLabel($row[CustomerRevenueDataset::LABEL]), $trainRows);
            $training     = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testRows as $row) {
                $testSamples[]         = self::toSample($row);
                $actual[]              = $row[CustomerRevenueDataset::LABEL];
                $baselinePredictions[] = max(0.0, (float)$row['trailing_12m_revenue']);
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
        $labels  = array_map(fn ($row) => CustomerRevenueDataset::logLabel($row[CustomerRevenueDataset::LABEL]), $rows);

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

        $invoices = CustomerSnapshots::invoicesFor($company);
        if ($invoices->count() < CustomerRevenueDataset::MIN_PRIOR_INVOICES) {
            return null;
        }

        $row           = CustomerRevenueDataset::extractRow($company, $invoices, now());
        $sample        = self::toSample($row);
        $logPrediction = $model->predict(Unlabeled::build([$sample]))[0];

        return max(0.0, exp($logPrediction) - 1);
    }
}
