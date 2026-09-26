<?php

namespace Tests\Unit\ML;

use App\ML\ProjectDataset;
use App\Models\Assignment;
use App\Models\Company;
use App\Models\CompanyContact;
use App\Models\Focus;
use App\Models\Milestone;
use App\Models\Param;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectDatasetTest extends TestCase {
    use DatabaseTransactions;

    private function makeCompany(): Company {
        return Company::factory()->create();
    }

    /**
     * `work_estimated`/`net` are precomputed columns that PrecomputedTrait resets
     * to their real (invoice-item-based) value on every save of this project OR of
     * a related Focus (which touches its parent) — so they must be written directly
     * to the DB as the LAST step, after all Focus records already exist.
     */
    private function setPrecomputed(Project $project, array $values): Project {
        DB::table('projects')->where('id', $project->id)->update($values);
        return $project->refresh();
    }

    public function test_eligible_projects_includes_finished_budget_based_project_with_quote_and_hours(): void {
        $project = Project::factory()
            ->for($this->makeCompany())
            ->finished()
            ->create(['is_time_based' => false, 'is_internal' => false]);

        Focus::factory()->forParent($project)->create(['duration' => 10]);
        Focus::factory()->forParent($project)->create(['duration' => 15]);
        $this->setPrecomputed($project, ['work_estimated' => 40]);

        self::assertTrue(ProjectDataset::eligibleProjects()->pluck('id')->contains($project->id));
    }
    public function test_eligible_projects_excludes_internal_time_based_unfinished_and_hourless_projects(): void {
        $company = $this->makeCompany();

        $internal = Project::factory()->for($company)->finished()
            ->create(['is_time_based' => false, 'is_internal' => true]);
        Focus::factory()->forParent($internal)->create(['duration' => 10]);
        $this->setPrecomputed($internal, ['work_estimated' => 40]);

        $timeBased = Project::factory()->for($company)->finished()
            ->create(['is_time_based' => true, 'is_internal' => false]);
        Focus::factory()->forParent($timeBased)->create(['duration' => 10]);
        $this->setPrecomputed($timeBased, ['work_estimated' => 40]);

        $unfinished = Project::factory()->for($company)
            ->create(['is_time_based' => false, 'is_internal' => false]);
        Focus::factory()->forParent($unfinished)->create(['duration' => 10]);
        $this->setPrecomputed($unfinished, ['work_estimated' => 40]);

        $noHours = Project::factory()->for($company)->finished()
            ->create(['is_time_based' => false, 'is_internal' => false]);
        $this->setPrecomputed($noHours, ['work_estimated' => 40]);

        $eligibleIds = ProjectDataset::eligibleProjects()->pluck('id');

        self::assertFalse($eligibleIds->contains($internal->id));
        self::assertFalse($eligibleIds->contains($timeBased->id));
        self::assertFalse($eligibleIds->contains($unfinished->id));
        self::assertFalse($eligibleIds->contains($noHours->id));
    }
    public function test_extract_row_computes_expected_feature_values(): void {
        $project = Project::factory()
            ->for($this->makeCompany())
            ->finished()
            ->create([
                'is_time_based'    => false,
                'is_internal'      => false,
                'lead_probability' => 0.6,
            ]);

        Focus::factory()->forParent($project)->create(['duration' => 10]);
        Focus::factory()->forParent($project)->create(['duration' => 15]);

        $userA = User::factory()->create();
        $userB = User::factory()->create();
        Assignment::factory()->forParent($project)->forAssignee($userA)->create(['hours_planned' => 8]);
        Assignment::factory()->forParent($project)->forAssignee($userB)->create(['hours_planned' => 12]);

        Milestone::factory()->create(['project_id' => $project->id]);
        Milestone::factory()->create(['project_id' => $project->id]);

        $project = $this->setPrecomputed($project, ['work_estimated' => 40, 'net' => 500]);
        $project->load(['hoursInvestedSum', 'milestones', 'assignees']);
        $row = ProjectDataset::extractRow($project);

        self::assertSame(40.0, $row['work_estimated']);
        self::assertSame(500.0, $row['net']);
        self::assertSame(20.0, $row['hours_planned_sum']);
        self::assertSame(2, $row['team_size']);
        self::assertSame(2, $row['milestone_count']);
        self::assertSame(0.6, $row['lead_probability']);
        self::assertSame(25.0, $row[ProjectDataset::LABEL]);

        $hoursPerDay = (float)(Param::get('INVOICE_HPD')->value ?? 8);
        self::assertEqualsWithDelta(40.0 / ($hoursPerDay * 2), $row['estimated_duration_days'], 0.0001);
    }
    public function test_extract_row_excludes_company_contacts_from_team_size_and_hours_planned(): void {
        $project = Project::factory()
            ->for($this->makeCompany())
            ->finished()
            ->create(['is_time_based' => false, 'is_internal' => false]);

        Focus::factory()->forParent($project)->create(['duration' => 10]);

        $worker = User::factory()->create();
        Assignment::factory()->forParent($project)->forAssignee($worker)->create(['hours_planned' => 8]);

        // A customer/company contact assigned as a point of contact — not part of the team doing the work.
        Assignment::create(array_merge($project->toPoly(), [
            'assignee_id'   => 999999,
            'assignee_type' => CompanyContact::class,
            'hours_planned' => 100, // if this leaked in, team_size/hours_planned_sum would be very wrong
            'flags'         => 0,
        ]));

        $project = $this->setPrecomputed($project, ['work_estimated' => 40]);
        $project->load(['hoursInvestedSum', 'milestones', 'assignees']);
        $row = ProjectDataset::extractRow($project);

        self::assertSame(1, $row['team_size']);
        self::assertSame(8.0, $row['hours_planned_sum']);
    }
    public function test_log_label_transforms_hours(): void {
        self::assertEqualsWithDelta(log(26), ProjectDataset::logLabel(25), 0.0001);
    }
}
