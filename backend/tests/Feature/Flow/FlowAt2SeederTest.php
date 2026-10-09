<?php

namespace Tests\Feature\Flow;

use App\Flow\Models\Gate;
use App\Flow\Models\JobType;
use App\Flow\Models\Phase;
use App\Flow\Models\RiskClass;
use App\Flow\Models\Transition;
use App\Models\Project;
use App\Models\ProjectState;
use App\Models\User;
use Database\Seeders\FlowAt2Seeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class FlowAt2SeederTest extends TestCase {
    use DatabaseTransactions;

    private function counts(): array {
        return [Role::count(), RiskClass::count(), Phase::count(), Gate::count(), Transition::count(), JobType::count(), ProjectState::count()];
    }
    public function test_seeder_is_idempotent_and_leaves_existing_states_untouched(): void {
        $namesBefore = ProjectState::orderBy('id')->pluck('name', 'id')->all();

        $this->seed(FlowAt2Seeder::class);
        $afterFirst = $this->counts();
        $this->seed(FlowAt2Seeder::class);

        $this->assertSame($afterFirst, $this->counts());
        foreach ($namesBefore as $id => $name) {
            $this->assertSame($name, ProjectState::find($id)->name);
        }
    }
    public function test_seeder_builds_the_at2flow_configuration(): void {
        $this->seed(FlowAt2Seeder::class);

        $this->assertSame([1, 1, 2, 2], RiskClass::orderBy('level')->pluck('release_required_approvals')->all());
        $this->assertSame(['conversion', 'discovery', 'mvp', 'care'], Phase::orderBy('sort')->pluck('key')->all());
        $this->assertSame('prepared', Phase::where('key', 'conversion')->sole()->projectState->name);
        $this->assertSame('hyper care', Phase::where('key', 'care')->sole()->projectState->name);
        $this->assertSame(['architecture', 'ui'], Phase::where('key', 'discovery')->sole()->gates->pluck('key')->all());
        $this->assertSame(['risk_level_gte' => 2], Phase::where('key', 'mvp')->sole()->gates->firstWhere('key', 'security')->condition);
        $this->assertNull(Phase::where('key', 'care')->sole()->gates->firstWhere('key', 'release')->required_approvals);
        $this->assertSame('release', JobType::byKey('care_fix')->release_gate_key);
        $this->assertSame(
            ['issue', 'repo', 'base_ref', 'harness_customer_path', 'harness_internal_path', 'escalation_rules'],
            array_column(JobType::byKey('care_fix')->input_schema['fields'], 'key')
        );
        $this->assertTrue(Role::where('name', 'dev')->exists() && Role::where('name', 'design')->exists());
    }
    public function test_discovery_cannot_be_left_without_architecture_and_ui_approval(): void {
        Bus::fake();
        $this->seed(FlowAt2Seeder::class);
        $discovery = Phase::where('key', 'discovery')->sole();
        $mvp       = Phase::where('key', 'mvp')->sole();
        $project   = Project::factory()->create();
        $project->states()->attach($discovery->project_state_id);

        $pm = User::factory()->create();
        $pm->assignRole('project_manager');
        $this->actingAs($pm)->putJson("/api/projects/{$project->id}", ['state' => $mvp->project_state_id])
            ->assertUnprocessable()
            ->assertJsonPath('errors.state.0', 'Phase "Discovery" cannot be left before these gates are approved: "Architektur" (architecture), "UI" (ui).');
    }
}
