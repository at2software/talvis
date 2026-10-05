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
use Rubix\ML\Transformers\ZScaleStandardizer;

class ProjectEarlyWarningModel {
    private const MODEL_PATH = 'ml/project_early_warning.rbx';

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
            (float)$row['work_estimated'],
            (float)$row['hours_logged_so_far'],
            (float)$row['elapsed_days'],
            (float)$row['burn_rate'],
            (float)$row['pct_of_quote_used'],
            (float)$row['remaining_quote'],
        ];
    }

    /**
     * Grouped k-fold cross-validation: checkpoints from the same project are
     * correlated (they share history), so folds are split by project_id, not
     * by row, or the model would partly "see" a project's own trajectory
     * during training and CV scores would be optimistic.
     *
     * @param list<array<string, mixed>> $rows ProjectCheckpointDataset::checkpointRows() output
     * @return array{n: int, projects: int, k: int, baseline: array<string, float>, estimators: array<string, array<string, float>>}
     */
    public static function evaluate(array $rows, int $folds = 5): array {
        $rowsByProject = [];
        foreach ($rows as $row) {
            $rowsByProject[$row['project_id']][] = $row;
        }
        $projectIds = array_keys($rowsByProject);
        shuffle($projectIds);
        $foldGroups = array_chunk($projectIds, (int)ceil(count($projectIds) / $folds));

        $actual              = [];
        $baselinePredictions = [];
        $modelPredictions    = array_fill_keys(array_keys(self::candidates()), []);

        foreach ($foldGroups as $testProjectIds) {
            $testSet = array_flip($testProjectIds);

            $trainRows = [];
            foreach ($rowsByProject as $projectId => $projectRows) {
                if (! isset($testSet[$projectId])) {
                    array_push($trainRows, ...$projectRows);
                }
            }
            $testRows = [];
            foreach ($testProjectIds as $projectId) {
                array_push($testRows, ...$rowsByProject[$projectId]);
            }

            $trainSamples = array_map(fn ($row) => self::toSample($row), $trainRows);
            $trainLabels  = array_map(fn ($row) => ProjectCheckpointDataset::logLabel($row[ProjectCheckpointDataset::LABEL]), $trainRows);
            $training     = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testRows as $row) {
                $testSamples[]          = self::toSample($row);
                $actual[]               = $row[ProjectCheckpointDataset::LABEL];
                $baselinePredictions[]  = max(0.0, $row['remaining_quote']);
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
            'projects'   => count($projectIds),
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
        $labels  = array_map(fn ($row) => ProjectCheckpointDataset::logLabel($row[ProjectCheckpointDataset::LABEL]), $rows);

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
    public static function predictRemaining(Project $project): ?float {
        $model = self::load();
        $row   = ProjectCheckpointDataset::currentRow($project);
        if (! $model || ! $row) {
            return null;
        }

        $sample        = self::toSample($row);
        $logPrediction = $model->predict(Unlabeled::build([$sample]))[0];

        return max(0.0, exp($logPrediction) - 1);
    }
    public static function predictFinal(Project $project): ?float {
        $remaining = self::predictRemaining($project);
        if ($remaining === null) {
            return null;
        }
        return (float)$project->hours_invested + $remaining;
    }
}
