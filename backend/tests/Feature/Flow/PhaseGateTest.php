<?php

namespace Tests\Feature\Flow;

use App\Flow\Models\Gate;
use App\Flow\Models\RiskClass;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use InvalidArgumentException;
use Tests\Feature\Flow\Concerns\BuildsFlowConfiguration;
use Tests\TestCase;

class PhaseGateTest extends TestCase {
    use BuildsFlowConfiguration;
    use DatabaseTransactions;

    private const IGNORED = 5;

    protected function setUp(): void {
        parent::setUp();
        Bus::fake();
        $this->buildFlow();
    }
    private function approveGate(Project $project, string $gateKey, int $approvers = 1): void {
        $approvalId = $this->asUser($this->userWithRole('project_manager'))
            ->postJson("/api/flow/projects/{$project->id}/gates/{$gateKey}/request")
            ->assertCreated()
            ->json('id');
        for ($i = 0; $i < $approvers; $i++) {
            $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$approvalId}/approve")->assertOk();
        }
    }
    private function moveTo(Project $project, int $stateId) {
        return $this->asUser($this->userWithRole('project_manager'))->putJson("/api/projects/{$project->id}", ['state' => $stateId]);
    }
    public function test_missing_gate_blocks_the_move_into_the_next_phase_and_names_it(): void {
        $project = Project::factory()->create();

        $this->moveTo($project, self::QUOTED)
            ->assertUnprocessable()
            ->assertJsonPath('errors.state.0', 'Phase "First" cannot be left before these gates are approved: "Architecture" (architecture).');
        $this->assertSame(self::PREPARED, $project->fresh()->state->id);
    }
    public function test_approved_gate_opens_the_next_phase(): void {
        $project = Project::factory()->create();
        $this->approveGate($project, 'architecture');

        $this->moveTo($project, self::QUOTED)->assertOk();
        $this->assertSame(self::QUOTED, $project->fresh()->state->id);
    }
    public function test_risk_condition_adds_a_four_eyes_gate(): void {
        $project = Project::factory()->create(['flow_risk_class_id' => RiskClass::where('key', 'high')->value('id')]);
        $this->approveGate($project, 'architecture');

        $this->moveTo($project, self::QUOTED)->assertJsonPath('errors.state.0', 'Phase "First" cannot be left before these gates are approved: "Security" (security).');

        $this->approveGate($project, 'security', 1);
        $this->moveTo($project, self::QUOTED)->assertUnprocessable();

        $pending = $this->asUser($this->userWithRole('project_manager'))->getJson("/api/flow/projects/{$project->id}/phase")->json('gates.1.pending_approval_id');
        $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$pending}/approve")->assertOk();
        $this->moveTo($project, self::QUOTED)->assertOk();
    }
    public function test_gate_approvals_from_an_earlier_visit_of_the_phase_do_not_count(): void {
        $project = Project::factory()->create();
        $this->approveGate($project, 'architecture');
        $this->moveTo($project, self::QUOTED)->assertOk();
        $this->travel(2)->seconds();
        $this->moveTo($project, self::PREPARED)->assertOk();

        $this->moveTo($project, self::QUOTED)->assertUnprocessable();
    }
    public function test_moves_backwards_or_out_of_the_phases_are_not_gated(): void {
        $this->moveTo(Project::factory()->create(), self::IGNORED)->assertOk();
    }
    public function test_phase_endpoint_reports_gate_status(): void {
        $project = Project::factory()->create(['flow_risk_class_id' => RiskClass::where('key', 'low')->value('id')]);

        $this->asUser($this->userWithRole('user'))->getJson("/api/flow/projects/{$project->id}/phase")
            ->assertOk()
            ->assertJsonPath('phase.key', 'first')
            ->assertJsonPath('next_phase.key', 'second')
            ->assertJsonPath('risk_class.key', 'low')
            ->assertJsonPath('gates.0.key', 'architecture')
            ->assertJsonPath('gates.0.applies', true)
            ->assertJsonPath('gates.0.satisfied', false)
            ->assertJsonPath('gates.1.applies', false)
            ->assertJsonPath('gates.2.required_approvals', 1);
    }
    public function test_risk_class_is_set_by_project_managers_and_audited(): void {
        $project = Project::factory()->create();
        $high    = RiskClass::where('key', 'high')->value('id');

        $this->asUser($this->userWithRole('user'))->putJson("/api/flow/projects/{$project->id}/risk-class", ['flow_risk_class_id' => $high])->assertForbidden();
        $this->asUser($this->userWithRole('project_manager'))->putJson("/api/flow/projects/{$project->id}/risk-class", ['flow_risk_class_id' => $high])
            ->assertOk()
            ->assertJsonPath('risk_class.key', 'high')
            ->assertJsonPath('gates.2.required_approvals', 2);
    }
    public function test_unknown_gate_condition_keys_are_rejected_when_saving(): void {
        foreach ([['script' => 'return true'], ['risk_level_gte' => '3'], ['always' => false], []] as $condition) {
            try {
                Gate::create(['key' => 'x'.count($condition), 'name' => 'X', 'phase_id' => $this->first->id, 'required_role' => 'admin', 'condition' => $condition]);
                $this->fail('Condition '.json_encode($condition).' was accepted.');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }
}
