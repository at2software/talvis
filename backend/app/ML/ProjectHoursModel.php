<?php

namespace App\ML;

use App\Models\Project;
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
use Rubix\ML\Transformers\OneHotEncoder;
use Rubix\ML\Transformers\ZScaleStandardizer;

/**
 * Model 1 — quote-accuracy regression. Trains on ProjectDataset::FEATURES to
 * predict log(hours_invested + 1), compared against the naive "trust the
 * quote" baseline (predict = work_estimated).
 */
class ProjectHoursModel {
    private const MODEL_PATH = 'ml/project_hours.rbx';

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
            new OneHotEncoder,
            new ZScaleStandardizer,
        ], $estimator);
    }

    /**
     * One ProjectDataset::extractRow() row into the fixed-order sample
     * vector the pipeline expects. `product_id` is the only categorical
     * column; '?' is MissingDataImputer's default missing-category placeholder.
     *
     * The 'product_' prefix is required, not cosmetic: NumericStringConverter
     * (first in the pipeline) converts numeric-looking strings back into
     * floats, so a bare "85" would silently become a float on rows that HAVE
     * a product_id while '?' stays a string on rows that don't — mixing types
     * within one column in a way that depends on fold composition, causing
     * intermittent crashes deep in MissingDataImputer/ZScaleStandardizer.
     *
     * Deliberately Phase-1 features + estimated_duration_days ONLY (8 columns),
     * not the full ProjectDataset::FEATURES (12, including Phase-2 company/PM/
     * product history). Measured on real data: adding the history columns made
     * every estimator WORSE (KNN MAE 42.6→44.2, GradientBoost 44.3→45.3),
     * including after log-transforming the outlier-heavy overrun ratio — see
     * the Phase 2 writeup in docs/ml/project-hours-plan.md. ProjectHistory/
     * extractRows() still compute and expose those features (row keys are
     * just ignored here) so this can be revisited once company_history_overrun
     * has more data or a cleaner distribution.
     *
     * estimated_duration_days (work_estimated / HPD / team_size, a parallelism-
     * adjusted duration estimate) is a mixed-but-not-negative result — flat for
     * KNN, a real R² improvement for RegressionTree (0.26→0.29) — so it's kept.
     */
    public static function toSample(array $row): array {
        return [
            (float)$row['work_estimated'],
            (float)$row['net'],
            (float)$row['hours_planned_sum'],
            (float)$row['team_size'],
            (float)$row['milestone_count'],
            (float)$row['lead_probability'],
            $row['product_id'] === null ? '?' : 'product_'.$row['product_id'],
            $row['estimated_duration_days'] === null ? NAN : (float)$row['estimated_duration_days'],
        ];
    }

    /**
     * Pooled k-fold cross-validation: every candidate estimator, plus the
     * "trust the quote" baseline, is scored on the SAME folds using
     * out-of-fold predictions inverted back to raw hours, so MAE/RMSE/SMAPE
     * are interpretable in hours and directly comparable to the baseline.
     *
     * @param list<array<string, mixed>> $rows ProjectDataset::extractRow() output
     * @return array{n: int, k: int, baseline: array<string, float>, estimators: array<string, array<string, float>>}
     */
    public static function evaluate(array $rows, int $folds = 5): array {
        $n       = count($rows);
        $indices = range(0, $n - 1);
        shuffle($indices);
        $foldGroups = array_chunk($indices, (int)ceil($n / $folds));

        $actual           = [];
        $quotePredictions = [];
        $modelPredictions = array_fill_keys(array_keys(self::candidates()), []);

        foreach ($foldGroups as $testIndices) {
            $trainIndices = array_diff($indices, $testIndices);

            $trainSamples = [];
            $trainLabels  = [];
            foreach ($trainIndices as $i) {
                $trainSamples[] = self::toSample($rows[$i]);
                $trainLabels[]  = ProjectDataset::logLabel($rows[$i][ProjectDataset::LABEL]);
            }
            $training = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testIndices as $i) {
                $testSamples[]       = self::toSample($rows[$i]);
                $actual[]            = $rows[$i][ProjectDataset::LABEL];
                $quotePredictions[]  = $rows[$i]['work_estimated'];
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
        $score = function (array $predictions) use ($metrics, $actual): array {
            $scores = [];
            foreach ($metrics as $key => $metric) {
                $value          = $metric->score($predictions, $actual);
                $scores[$key]   = $key === 'r2' ? $value : -$value;
            }
            return $scores;
        };

        $result = [
            'n'          => $n,
            'k'          => count($foldGroups),
            'baseline'   => $score($quotePredictions),
            'estimators' => [],
        ];
        foreach ($modelPredictions as $name => $predictions) {
            $result['estimators'][$name] = $score($predictions);
        }
        return $result;
    }

    public static function train(array $rows, Learner $estimator): PersistentModel {
        $samples = [];
        $labels  = [];
        foreach ($rows as $row) {
            $samples[] = self::toSample($row);
            $labels[]  = ProjectDataset::logLabel($row[ProjectDataset::LABEL]);
        }

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
    public static function predict(Project $project): ?float {
        $model = self::load();
        if (! $model) {
            return null;
        }

        $sample        = self::toSample(ProjectDataset::extractRow($project));
        $logPrediction = $model->predict(Unlabeled::build([$sample]))[0];

        return max(0.0, exp($logPrediction) - 1);
    }
}
