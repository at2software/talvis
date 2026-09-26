<?php

namespace Tests\Unit\ML;

use App\ML\ProjectQuoteHistory;
use App\Models\Company;
use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectQuoteHistoryTest extends TestCase {
    use DatabaseTransactions;

    /** Pin the (single) decision-state pivot timestamp so decision_at == $at. */
    private function decideAt(Project $project, Carbon $at): Project {
        DB::table('project_project_state')
            ->where('project_id', $project->id)
            ->orderByDesc('id')
            ->limit(1)
            ->update(['created_at' => $at]);

        return $project->refresh();
    }
    public function test_excludes_projects_decided_after_the_targets_decision_at(): void {
        $company = Company::factory()->create();

        $old = Project::factory()->for($company)->running()->create();
        $old = $this->decideAt($old, Carbon::create(2026, 1, 1));

        $target = Project::factory()->for($company)->finished(false)->create();
        $target = $this->decideAt($target, Carbon::create(2026, 1, 10));

        $future = Project::factory()->for($company)->running()->create();
        $future = $this->decideAt($future, Carbon::create(2026, 1, 20));

        $pool = collect([$old, $target, $future])->each->load('states');

        $history = ProjectQuoteHistory::compute($pool, collect([$target->load('states')]));

        self::assertSame(1, $history[$target->id]['company_prior_decided_count']);
        self::assertEqualsWithDelta(1.0, $history[$target->id]['company_acceptance_rate'], 0.0001); // only $old counts, and it accepted
    }
    public function test_excludes_the_target_itself_even_when_it_is_the_only_project(): void {
        $company = Company::factory()->create();

        $target = Project::factory()->for($company)->running()->create();
        $target = $this->decideAt($target, Carbon::create(2026, 1, 10))->load('states');

        $history = ProjectQuoteHistory::compute(collect([$target]), collect([$target]));

        self::assertSame(0, $history[$target->id]['company_prior_decided_count']);
        self::assertNull($history[$target->id]['company_acceptance_rate']);
    }
    public function test_mixes_accepted_and_rejected_prior_quotes_into_a_rate(): void {
        $company = Company::factory()->create();

        $accepted = Project::factory()->for($company)->running()->create();
        $accepted = $this->decideAt($accepted, Carbon::create(2026, 1, 1));

        $rejected = Project::factory()->for($company)->finished(false)->create();
        $rejected = $this->decideAt($rejected, Carbon::create(2026, 1, 2));

        $target = Project::factory()->for($company)->running()->create();
        $target = $this->decideAt($target, Carbon::create(2026, 2, 1))->load('states');

        $pool    = collect([$accepted, $rejected, $target])->each->load('states');
        $history = ProjectQuoteHistory::compute($pool, collect([$target]));

        self::assertSame(2, $history[$target->id]['company_prior_decided_count']);
        self::assertEqualsWithDelta(0.5, $history[$target->id]['company_acceptance_rate'], 0.0001);
    }
    public function test_falls_back_to_now_as_cutoff_for_an_undecided_target(): void {
        // Live-inference case: the target hasn't been decided yet, so decision_at is
        // null — history must still see ALL of the company's already-decided quotes,
        // not zero them out (there's no leakage risk for a real-time prediction).
        $company = Company::factory()->create();

        $old = Project::factory()->for($company)->running()->create();
        $old = $this->decideAt($old, Carbon::now()->subDay());

        $target = Project::factory()->for($company)->create()->load('states'); // still "Prepared" only

        $history = ProjectQuoteHistory::compute(collect([$old, $target])->each->load('states'), collect([$target]));

        self::assertSame(1, $history[$target->id]['company_prior_decided_count']);
        self::assertEqualsWithDelta(1.0, $history[$target->id]['company_acceptance_rate'], 0.0001);
    }
}
