<?php

namespace Tests\Unit\ML;

use App\ML\ProjectQuoteDataset;
use App\ML\ProjectQuoteModel;
use PHPUnit\Framework\TestCase;

class ProjectQuoteModelTest extends TestCase {
    private function row(array $overrides = []): array {
        return array_merge([
            'company_id'                    => 1,
            'item_count'                    => 3,
            'net'                           => 2000.0,
            'discount_pct'                  => 5.0,
            'prefix_length'                 => 0,
            'days_pending'                  => 7,
            'company_acceptance_rate'       => 0.6,
            'company_prior_decided_count'   => 4,
            ProjectQuoteDataset::LABEL      => 0,
        ], $overrides);
    }
    public function test_to_sample_produces_fixed_order_vector(): void {
        self::assertSame(
            [3.0, 2000.0, 5.0, 0.0, 7.0, 0.6, 4.0],
            ProjectQuoteModel::toSample($this->row())
        );
    }
    public function test_to_sample_uses_nan_for_missing_company_acceptance_rate(): void {
        $sample = ProjectQuoteModel::toSample($this->row(['company_acceptance_rate' => null]));
        self::assertNan($sample[5]);
    }
    public function test_label_is_a_string_for_the_rubix_classifier(): void {
        self::assertSame('1', ProjectQuoteModel::label($this->row([ProjectQuoteDataset::LABEL => 1])));
        self::assertSame('0', ProjectQuoteModel::label($this->row([ProjectQuoteDataset::LABEL => 0])));
    }
    public function test_evaluate_reports_class_balance_and_groups_by_company(): void {
        $rows = [];
        // 12 companies, 3 rows each; 5 of 12 companies are fully "accepted". With 4
        // folds (~3-company chunks), 5 positive and 7 negative companies can't be
        // fully drained into a single fold's test set (chunk size < either count),
        // so every fold's training set keeps both classes — required by the
        // classifiers evaluate() also trains here (e.g. LogisticRegression errors
        // if a fold collapses to one class).
        foreach (range(1, 12) as $companyId) {
            foreach ([0, 1, 2] as $k) {
                $accepted = ($companyId <= 5) ? 1 : 0;
                $rows[]   = $this->row([
                    'company_id'                    => $companyId,
                    'company_acceptance_rate'       => $accepted ? 0.9 : 0.1,
                    ProjectQuoteDataset::LABEL      => $accepted,
                ]);
            }
        }
        self::assertCount(36, $rows);

        $result = ProjectQuoteModel::evaluate($rows, folds: 4);

        self::assertSame(36, $result['n']);
        self::assertSame(12, $result['companies']);
        self::assertSame(4, $result['k']);
        self::assertSame(15, $result['positives']);
        self::assertEqualsWithDelta(15 / 36, $result['positive_rate'], 0.0001);
    }
    public function test_evaluate_baseline_predicts_from_company_acceptance_rate(): void {
        $rows = [];
        foreach (range(1, 10) as $companyId) {
            // High company acceptance rate AND actually accepted → baseline gets it right.
            $rows[] = $this->row([
                'company_id'                    => $companyId,
                'company_acceptance_rate'       => 0.9,
                ProjectQuoteDataset::LABEL      => 1,
            ]);
            // Low company acceptance rate AND actually rejected → baseline gets it right.
            $rows[] = $this->row([
                'company_id'                    => $companyId,
                'company_acceptance_rate'       => 0.1,
                ProjectQuoteDataset::LABEL      => 0,
            ]);
        }

        $result = ProjectQuoteModel::evaluate($rows, folds: 5);

        self::assertEqualsWithDelta(1.0, $result['baseline']['accuracy'], 0.0001);
        self::assertEqualsWithDelta(1.0, $result['baseline']['recall'], 0.0001);
        self::assertEqualsWithDelta(1.0, $result['baseline']['precision'], 0.0001);
    }
    public function test_evaluate_baseline_falls_back_to_training_majority_without_company_history(): void {
        $rows = [];
        // 20 companies accepted-with-history + 8 rejected-with-history: with 5
        // folds (~6-company chunks), no possible random shuffle can drain either
        // group to zero, or flip the training-fold majority away from "accepted"
        // (worst case removes a full chunk of accepted companies, leaving 14
        // accepted vs 8 rejected — still a clear majority). 2 more companies have
        // NO prior history (null rate) and must fall back to that majority —
        // labelled accepted so a correct fallback is verifiable via recall.
        foreach (range(1, 20) as $companyId) {
            $rows[] = $this->row([
                'company_id'                    => $companyId,
                'company_acceptance_rate'       => 0.9,
                ProjectQuoteDataset::LABEL      => 1,
            ]);
        }
        foreach (range(21, 28) as $companyId) {
            $rows[] = $this->row([
                'company_id'                    => $companyId,
                'company_acceptance_rate'       => 0.1,
                ProjectQuoteDataset::LABEL      => 0,
            ]);
        }
        foreach ([29, 30] as $companyId) {
            $rows[] = $this->row([
                'company_id'                    => $companyId,
                'company_acceptance_rate'       => null,
                ProjectQuoteDataset::LABEL      => 1, // majority class, so the fallback should get it right
            ]);
        }

        $result = ProjectQuoteModel::evaluate($rows, folds: 5);

        // Majority class (accepted) is the fallback prediction for rows without
        // company history, so baseline recall on the positive class stays 1.0.
        self::assertEqualsWithDelta(1.0, $result['baseline']['recall'], 0.0001);
    }
    public function test_evaluate_metrics_are_in_zero_to_one_range(): void {
        $rows = [];
        foreach (range(1, 12) as $companyId) {
            foreach ([0, 1] as $k) {
                $accepted = ($companyId + $k) % 3 === 0 ? 1 : 0;
                $rows[]   = $this->row([
                    'company_id'                    => $companyId,
                    'company_acceptance_rate'       => $accepted ? 0.8 : 0.2,
                    ProjectQuoteDataset::LABEL      => $accepted,
                ]);
            }
        }

        $result = ProjectQuoteModel::evaluate($rows, folds: 4);

        foreach (array_merge([$result['baseline']], array_values($result['estimators'])) as $metrics) {
            self::assertGreaterThanOrEqual(0.0, $metrics['accuracy']);
            self::assertLessThanOrEqual(1.0, $metrics['accuracy']);
            self::assertGreaterThanOrEqual(0.0, $metrics['f1']);
            self::assertLessThanOrEqual(1.0, $metrics['f1']);
            self::assertGreaterThanOrEqual(0.0, $metrics['precision']);
            self::assertLessThanOrEqual(1.0, $metrics['recall']);
        }
    }
}
