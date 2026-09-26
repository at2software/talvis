<?php

namespace Tests\Unit\ML;

use App\ML\ProjectCheckpointDataset;
use App\Models\Company;
use App\Models\Focus;
use App\Models\Project;
use App\Models\ProjectState;
use Carbon\Carbon;
use Database\Factories\ProjectStateFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectCheckpointDatasetTest extends TestCase {
    use DatabaseTransactions;

    /**
     * Attach a state and pin its pivot timestamp, so started_at/finished_at are
     * deterministic. Timestamps passed directly into attach()'s pivot array are
     * silently overwritten by Laravel's withTimestamps() auto-stamping, so the
     * pivot row is corrected with a raw update afterwards instead.
     */
    private function attachStateAt(Project $project, int $progress, Carbon $at): Project {
        $state = ProjectStateFactory::new()->state(['progress' => $progress])->create();
        $project->states()->attach($state->id);

        DB::table('project_project_state')
            ->where('project_id', $project->id)
            ->where('project_state_id', $state->id)
            ->update(['created_at' => $at, 'updated_at' => $at]);

        return $project->refresh();
    }

    /**
     * `work_estimated` is a precomputed column that PrecomputedTrait resets on every
     * save of this project OR of a related Focus (Focus touches its parent) — so it
     * must be written directly to the DB as the LAST step, after all Focus records
     * already exist. See ProjectDatasetTest for the full explanation.
     */
    private function setWorkEstimated(Project $project, float $value): Project {
        DB::table('projects')->where('id', $project->id)->update(['work_estimated' => $value]);

        return $project->refresh();
    }

    private function makeProject(Carbon $startedAt, Carbon $finishedAt): Project {
        $project = Project::factory()->for(Company::factory()->create())
            ->create(['is_time_based' => false, 'is_internal' => false]);
        $project = $this->attachStateAt($project, ProjectState::Running, $startedAt);

        return $this->attachStateAt($project, ProjectState::Finished, $finishedAt);
    }
    public function test_checkpoint_rows_only_count_foci_logged_at_or_before_the_checkpoint(): void {
        $start   = Carbon::create(2026, 1, 1, 0, 0, 0, 'UTC');
        $finish  = Carbon::create(2026, 4, 11, 0, 0, 0, 'UTC'); // 100 days later
        $project = $this->makeProject($start, $finish);

        Focus::factory()->forParent($project)->create(['started_at' => $start->copy()->addDays(10), 'duration' => 5]);
        Focus::factory()->forParent($project)->create(['started_at' => $start->copy()->addDays(30), 'duration' => 10]);
        Focus::factory()->forParent($project)->create(['started_at' => $start->copy()->addDays(60), 'duration' => 8]);
        Focus::factory()->forParent($project)->create(['started_at' => $start->copy()->addDays(90), 'duration' => 3]);
        // total hours_invested = 26
        $project = $this->setWorkEstimated($project, 100.0);

        $projects = ProjectCheckpointDataset::eligibleProjects()->filter(fn (Project $p) => $p->id === $project->id)->values();
        self::assertCount(1, $projects, 'project should pass the >=5 day span filter');

        $rows = ProjectCheckpointDataset::checkpointRows($projects);
        self::assertCount(3, $rows);

        // 25% checkpoint = day 25: only the day-10 focus (5h) is in range
        self::assertEqualsWithDelta(5.0, $rows[0]['hours_logged_so_far'], 0.01);
        self::assertEqualsWithDelta(21.0, $rows[0]['remaining_hours'], 0.01);
        // Delta covers DST reinterpretation drift when the pivot's raw UTC timestamp
        // is re-read through the app's local timezone (Jan/Apr straddle a DST change).
        self::assertEqualsWithDelta(25.0, $rows[0]['elapsed_days'], 0.05);

        // 50% checkpoint = day 50: day-10 (5h) + day-30 (10h) = 15h
        self::assertEqualsWithDelta(15.0, $rows[1]['hours_logged_so_far'], 0.01);
        self::assertEqualsWithDelta(11.0, $rows[1]['remaining_hours'], 0.01);

        // 75% checkpoint = day 75: + day-60 (8h) = 23h. The day-90 focus must NOT leak in.
        self::assertEqualsWithDelta(23.0, $rows[2]['hours_logged_so_far'], 0.01);
        self::assertEqualsWithDelta(3.0, $rows[2]['remaining_hours'], 0.01);
    }
    public function test_eligible_projects_excludes_short_lived_projects(): void {
        $start   = Carbon::create(2026, 1, 1, 0, 0, 0, 'UTC');
        $finish  = $start->copy()->addDays(2); // below MIN_DURATION_DAYS = 5
        $project = $this->makeProject($start, $finish);
        Focus::factory()->forParent($project)->create(['started_at' => $start->copy()->addHours(6), 'duration' => 4]);
        $project = $this->setWorkEstimated($project, 20.0);

        $ids = ProjectCheckpointDataset::eligibleProjects()->pluck('id');
        self::assertFalse($ids->contains($project->id));
    }
    public function test_current_row_uses_now_as_the_checkpoint_and_has_no_label(): void {
        $start   = now()->subDays(10);
        $project = Project::factory()->for(Company::factory()->create())
            ->create(['is_time_based' => false, 'is_internal' => false]);
        $project = $this->attachStateAt($project, ProjectState::Running, $start);

        Focus::factory()->forParent($project)->create(['started_at' => $start->copy()->addDays(2), 'duration' => 6]);
        DB::table('projects')->where('id', $project->id)->update(['work_estimated' => 40]);
        $project->refresh();

        $row = ProjectCheckpointDataset::currentRow($project);

        self::assertArrayNotHasKey(ProjectCheckpointDataset::LABEL, $row);
        self::assertEqualsWithDelta(6.0, $row['hours_logged_so_far'], 0.01);
        self::assertEqualsWithDelta(34.0, $row['remaining_quote'], 0.01);
    }
    public function test_current_row_is_null_without_a_started_at(): void {
        $project = Project::factory()->for(Company::factory()->create())
            ->create(['is_time_based' => false, 'is_internal' => false]);

        self::assertNull(ProjectCheckpointDataset::currentRow($project));
    }
}
