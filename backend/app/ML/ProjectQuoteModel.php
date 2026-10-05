<?php

namespace App\ML;

use App\Models\Project;
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
 * Quote-acceptance classification. Trains on ProjectQuoteDataset::FEATURES to
 * predict the binary label "accepted" (project ever reached a Running-progress
 * state), compared against a "company persistence" baseline: predict accepted
 * iff the company's own prior acceptance rate is above 50%, falling back to
 * the training fold's global majority class when the company has no prior
 * decided quotes.
 *
 * Classifiers only (all Probabilistic so predict() can return an acceptance
 * probability). Grouped k-fold CV by company_id — a company's quotes are
 * correlated (same decision-maker, same relationship), same discipline as
 * CustomerChurnModel. Unlike churn's ~11% minority, accepted/rejected here is
 * roughly 53/47, so no imbalance correction is needed on the candidates.
 */
class ProjectQuoteModel {
    private const MODEL_PATH = 'ml/project_quote_acceptance.rbx';
    public const ACCEPTED    = 1;

    /** @return array<string, callable(): Learner> */
    public static function candidates(): array {
        return [
            'LogisticRegression' => fn () => new LogisticRegression,
            'KNearestNeighbors'  => fn () => new KNearestNeighbors(5),
            'ClassificationTree' => fn () => new ClassificationTree,
            'RandomForest'       => fn () => new RandomForest(new ClassificationTree, 100, 0.2, true),
            'GaussianNB'         => fn () => new GaussianNB,
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
            (float)$row['item_count'],
            (float)$row['net'],
            (float)$row['discount_pct'],
            (float)$row['prefix_length'],
            (float)$row['days_pending'],
            $row['company_acceptance_rate'] === null ? NAN : (float)$row['company_acceptance_rate'],
            (float)$row['company_prior_decided_count'],
        ];
    }
    public static function label(array $row): string {
        return (string)$row[ProjectQuoteDataset::LABEL];
    }

    /**
     * Grouped k-fold cross-validation: quotes from the same company are
     * correlated, so folds are split by company_id, never by row (mirrors
     * CustomerChurnModel). Every candidate classifier, plus the naive
     * company-persistence baseline, is scored on the SAME out-of-fold
     * predictions.
     *
     * @param list<array<string, mixed>> $rows ProjectQuoteDataset::extractRow() output
     * @return array{n: int, companies: int, k: int, positives: int, positive_rate: float, baseline: array<string, float>, estimators: array<string, array<string, float>>}
     */
    public static function evaluate(array $rows, int $folds = 5): array {
        $rowsByCompany = [];
        foreach ($rows as $row) {
            $rowsByCompany[$row['company_id'] ?? 0][] = $row;
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

            $trainAcceptedRate = count($trainRows) > 0
                ? count(array_filter($trainRows, fn ($row) => $row[ProjectQuoteDataset::LABEL] === self::ACCEPTED)) / count($trainRows)
                : 0.5;

            $trainSamples = array_map(fn ($row) => self::toSample($row), $trainRows);
            $trainLabels  = array_map(fn ($row) => self::label($row), $trainRows);
            $training     = Labeled::build($trainSamples, $trainLabels);

            $testSamples = [];
            foreach ($testRows as $row) {
                $testSamples[]         = self::toSample($row);
                $actual[]              = self::label($row);
                $companyRate           = $row['company_acceptance_rate'];
                $baselinePredictions[] = (string)(($companyRate !== null ? $companyRate : $trainAcceptedRate) > 0.5 ? 1 : 0);
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

        $positives = count(array_filter($actual, fn ($label) => $label === (string)self::ACCEPTED));

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
        $pos = (string)self::ACCEPTED;
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
    public static function probaForRow(array $row): ?float {
        return self::probaForRows([$row])[0] ?? null;
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<float>
     */
    public static function probaForRows(array $rows): array {
        $model = self::load();
        if (! $model || empty($rows)) {
            return [];
        }
        $samples = array_map(fn ($row) => self::toSample($row), $rows);
        $probas  = $model->proba(Unlabeled::build($samples));
        return array_map(fn ($proba) => (float)($proba[(string)self::ACCEPTED] ?? 0.0), $probas);
    }

    public static function predict(Project $project): ?float {
        $history = ProjectQuoteHistory::compute(ProjectQuoteDataset::eligibleProjects(), collect([$project]));
        $row     = ProjectQuoteDataset::extractRow($project, $history[$project->id] ?? []);

        return self::probaForRow($row);
    }
}
