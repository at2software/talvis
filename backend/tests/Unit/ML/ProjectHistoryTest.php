<?php

namespace Tests\Unit\ML;

use App\ML\ProjectHistory;
use App\Models\Company;
use App\Models\Focus;
use App\Models\Project;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectHistoryTest extends TestCase {
    use DatabaseTransactions;

    private function makeCompany(): Company {
        return Company::factory()->create();
    }

    /** Pin the (single) Finished-state pivot timestamp so decision_at == finished_at == $at. */
    private function finishAt(Project $project, Carbon $at): Project {
        DB::table('project_project_state')
            ->where('project_id', $project->id)
            ->orderByDesc('id')
            ->limit(1)
            ->update(['created_at' => $at]);

        return $project->refresh();
    }

    private function withQuoteAccuracy(Project $project, float $workEstimated, float $hoursInvested): Project {
        Focus::factory()->forParent($project)->create(['duration' => $hoursInvested]);
        DB::table('projects')->where('id', $project->id)->update(['work_estimated' => $workEstimated]);

        return $project->refresh()->load('hoursInvestedSum');
    }
    public function test_excludes_projects_finished_after_the_targets_decision_at(): void {
        $company = $this->makeCompany();

        $old = Project::factory()->for($company)->finished()->create(['is_time_based' => false, 'is_internal' => false]);
        $old = $this->finishAt($old, Carbon::create(2026, 1, 1));
        $old = $this->withQuoteAccuracy($old, 10, 20); // quote_accuracy = 2.0

        $target = Project::factory()->for($company)->finished()->create(['is_time_based' => false, 'is_internal' => false]);
        $target = $this->finishAt($target, Carbon::create(2026, 1, 10));

        $future = Project::factory()->for($company)->finished()->create(['is_time_based' => false, 'is_internal' => false]);
        $future = $this->finishAt($future, Carbon::create(2026, 1, 20));
        $future = $this->withQuoteAccuracy($future, 10, 100); // quote_accuracy = 10.0, but AFTER target's cutoff

        $pool = collect([$old, $target, $future]);

        $history = ProjectHistory::compute($pool, collect([$target]));

        self::assertSame(1, $history[$target->id]['company_prior_count']);
        self::assertEqualsWithDelta(2.0, $history[$target->id]['company_history_overrun'], 0.0001);
    }
    public function test_excludes_the_target_itself_even_when_it_is_the_only_project(): void {
        $company = $this->makeCompany();

        $target = Project::factory()->for($company)->finished()->create(['is_time_based' => false, 'is_internal' => false]);
        $target = $this->finishAt($target, Carbon::create(2026, 1, 10));

        $history = ProjectHistory::compute(collect([$target]), collect([$target]));

        self::assertSame(0, $history[$target->id]['company_prior_count']);
        self::assertNull($history[$target->id]['company_history_overrun']);
    }
    public function test_pm_and_product_history_are_null_when_target_has_neither(): void {
        $company = $this->makeCompany();

        $pmProject = Project::factory()->for($company)->finished()
            ->create(['is_time_based' => false, 'is_internal' => false, 'project_manager_id' => User::factory()->create()->id]);
        $pmProject = $this->finishAt($pmProject, Carbon::create(2026, 1, 1));
        $pmProject = $this->withQuoteAccuracy($pmProject, 10, 15);

        $target = Project::factory()->for($company)->finished()
            ->create(['is_time_based' => false, 'is_internal' => false]);
        $target = $this->finishAt($target, Carbon::create(2026, 1, 10));

        $history = ProjectHistory::compute(collect([$pmProject, $target]), collect([$target]));

        self::assertNull($history[$target->id]['pm_history_overrun']);
        self::assertNull($history[$target->id]['product_history_overrun']);
    }
    public function test_company_history_is_null_when_target_has_no_decision_at(): void {
        $company = $this->makeCompany();

        $old = Project::factory()->for($company)->finished()->create(['is_time_based' => false, 'is_internal' => false]);
        $old = $this->finishAt($old, Carbon::create(2026, 1, 1));
        $old = $this->withQuoteAccuracy($old, 10, 20);

        // No finished()/running() state beyond the auto-attached "Prepared" one, so decision_at is null.
        $target = Project::factory()->for($company)->create(['is_time_based' => false, 'is_internal' => false]);

        $history = ProjectHistory::compute(collect([$old, $target]), collect([$target]));

        self::assertSame(0, $history[$target->id]['company_prior_count']);
        self::assertNull($history[$target->id]['company_history_overrun']);
    }
}
