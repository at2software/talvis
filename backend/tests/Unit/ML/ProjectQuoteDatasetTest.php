<?php

namespace Tests\Unit\ML;

use App\Enums\InvoiceItemType;
use App\ML\ProjectQuoteDataset;
use App\Models\InvoiceItem;
use App\Models\Project;
use Carbon\Carbon;
use Database\Factories\ProjectStateFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectQuoteDatasetTest extends TestCase {
    use DatabaseTransactions;

    public function test_is_accepted_true_when_project_ever_reached_running(): void {
        $project = Project::factory()->running()->create();

        self::assertTrue(ProjectQuoteDataset::isAccepted($project->load('states')));
    }
    public function test_is_accepted_false_when_project_finished_without_ever_running(): void {
        // "lead failed" style — decided straight from Prepared to Finished/unsuccessful.
        $project = Project::factory()->finished(successful: false)->create();

        self::assertFalse(ProjectQuoteDataset::isAccepted($project->load('states')));
    }
    public function test_is_accepted_true_when_project_ran_then_finished_successfully(): void {
        $project = Project::factory()->running()->create();
        $project->states()->attach(
            ProjectStateFactory::new()->finished(true)->create()->id
        );

        self::assertTrue(ProjectQuoteDataset::isAccepted($project->refresh()->load('states')));
    }
    public function test_extract_row_computes_item_count_net_and_weighted_discount(): void {
        $project = Project::factory()->create();

        // Two default items: 1000 @ 0% discount, 1000 @ 10% discount → weighted 5%, net = 1000 + 900.
        InvoiceItem::factory()->create(['project_id' => $project->id, 'type' => InvoiceItemType::Default, 'price' => 1000, 'qty' => 1, 'discount' => 0]);
        InvoiceItem::factory()->create(['project_id' => $project->id, 'type' => InvoiceItemType::Default, 'price' => 1000, 'qty' => 1, 'discount' => 10]);
        // Header items are not part of ProjectTotal and must be ignored entirely.
        InvoiceItem::factory()->create(['project_id' => $project->id, 'type' => InvoiceItemType::Header, 'price' => 0, 'qty' => 1]);

        $row = ProjectQuoteDataset::extractRow($project->fresh());

        self::assertSame(2, $row['item_count']);
        self::assertEqualsWithDelta(1900.0, $row['net'], 0.01);
        self::assertEqualsWithDelta(5.0, $row['discount_pct'], 0.01);
    }
    public function test_extract_row_discount_pct_is_zero_with_no_items(): void {
        $project = Project::factory()->create();

        $row = ProjectQuoteDataset::extractRow($project->fresh());

        self::assertSame(0, $row['item_count']);
        self::assertEqualsWithDelta(0.0, $row['net'], 0.01);
        self::assertEqualsWithDelta(0.0, $row['discount_pct'], 0.01);
    }
    public function test_extract_row_uses_history_values_when_supplied(): void {
        $project = Project::factory()->create();

        $row = ProjectQuoteDataset::extractRow($project->fresh(), [
            'company_acceptance_rate'     => 0.75,
            'company_prior_decided_count' => 4,
        ]);

        self::assertSame(0.75, $row['company_acceptance_rate']);
        self::assertSame(4, $row['company_prior_decided_count']);
    }
    public function test_extract_row_history_defaults_to_null_and_zero_when_omitted(): void {
        $project = Project::factory()->create();

        $row = ProjectQuoteDataset::extractRow($project->fresh());

        self::assertNull($row['company_acceptance_rate']);
        self::assertSame(0, $row['company_prior_decided_count']);
    }
    public function test_days_pending_uses_now_when_project_is_undecided(): void {
        $project = Project::factory()->create();
        DB::table('projects')->where('id', $project->id)->update(['created_at' => Carbon::now()->subDays(10)]);

        $row = ProjectQuoteDataset::extractRow($project->fresh());

        // created_at is cast to 'date' (midnight, time-of-day dropped), so the diff
        // against the exact current time-of-day can round to 10 or 11 depending on
        // when in the day the test runs — assert within a 1-day tolerance.
        self::assertEqualsWithDelta(10, $row['days_pending'], 1);
    }
    public function test_days_pending_uses_decision_at_once_decided(): void {
        $project = Project::factory()->running()->create();
        DB::table('projects')->where('id', $project->id)->update(['created_at' => Carbon::create(2026, 1, 1)]);
        // The Running-state pivot is the most recently inserted row (after the auto-attached "Prepared" one).
        DB::table('project_project_state')
            ->where('project_id', $project->id)
            ->orderByDesc('id')
            ->limit(1)
            ->update(['created_at' => Carbon::create(2026, 1, 15)]);

        $row = ProjectQuoteDataset::extractRow($project->fresh());

        // Fixed at 14 days regardless of when the test actually runs — unlike the
        // undecided case, a decided quote's days_pending must NOT keep growing with now().
        self::assertSame(14, $row['days_pending']);
    }
    public function test_eligible_query_excludes_undecided_projects(): void {
        $decided   = Project::factory()->running()->create();
        $undecided = Project::factory()->create(); // only the auto-attached "Prepared" state

        $ids = ProjectQuoteDataset::eligibleQuery()->pluck('id');

        self::assertTrue($ids->contains($decided->id));
        self::assertFalse($ids->contains($undecided->id));
    }
}
