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
 * Support-load forecast model — trains on SupportLoadDataset::FEATURES to
 * predict log(support_hours_next_window + 1), compared against the naive
 * "persistence" baseline (predict next window = trailing support hours over
 * an equal-length window). Mirrors CustomerRevenueModel's shape exactly.
 *
 * No categorical features, so the pipeline skips OneHotEncoder, same as
 * CustomerRevenueModel / ProjectEarlyWarningModel.
 */
class SupportLoadModel {
    private const MODEL_PATH = 'ml/support_load.rbx';

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

    /** Reads all of SupportLoadDataset::FEATURES, in order. */
    public static function toSample(array $row): array {
        return [
            (float)$row['trailing_3m_support_hours'],
            (float)$row['trailing_6m_support_hours'],
            (float)$row['trailing_12m_support_hours'],
            (float)$row['lifetime_support_hours'],
            (float)$row['support_ticket_count_trailing_12m'],
            (float)$row['active_project_count_at_cutoff'],
            (float)$row['trailing_12m_revenue'],
            (float)$row['tenure_days'],
            (float)$row['days_since_last_support'],
            (float)$row['accepts_support'],
        ];
    }

    /**
     * Grouped k-fold cross-validation, folds split by `company_id` — mirrors
     * CustomerRevenueModel::evaluate() exactly (see its docblock for why).
     *
     * @param list<array<string, mixed>> $rows SupportLoadDataset::extractRow() output
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
            $trainLabels  = array_map(fn ($row) => SupportLoadDataset::logLabel($row[SupportLoadDataset::LABEL]), $trainRows);
            $training     = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testRows as $row) {
                $testSamples[]         = self::toSample($row);
                $actual[]              = $row[SupportLoadDataset::LABEL];
                $baselinePredictions[] = max(0.0, (float)$row['trailing_3m_support_hours']);
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
        $labels  = array_map(fn ($row) => SupportLoadDataset::logLabel($row[SupportLoadDataset::LABEL]), $rows);

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

    /**
     * Predict a company's support hours over the next SupportLoadDataset::WINDOW_MONTHS
     * (today acting as the cutoff). Returns null if no trained model is
     * persisted yet, or if the company doesn't have enough support-focus
     * history to compute features at all.
     */
    public static function predict(Company $company): ?float {
        $model = self::load();
        if (! $model) {
            return null;
        }

        $foci = CustomerSnapshots::fociFor($company);
        if ($foci->count() < SupportLoadDataset::MIN_PRIOR_SUPPORT_FOCI) {
            return null;
        }

        $invoices = CustomerSnapshots::invoicesFor($company);
        $projects = $company->projects()->with('states')->get();

        $row           = SupportLoadDataset::extractRow($company, $foci, $invoices, $projects, now());
        $sample        = self::toSample($row);
        $logPrediction = $model->predict(Unlabeled::build([$sample]))[0];

        return max(0.0, exp($logPrediction) - 1);
    }
}
