<?php

namespace Tests\Feature\Flow;

use App\Flow\JobStateMachine;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Gate;
use App\Flow\Models\JobType;
use App\Flow\Models\Transition;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Feature\Flow\Concerns\BuildsFlowConfiguration;
use Tests\TestCase;

class FlowAdminTest extends TestCase {
    use BuildsFlowConfiguration;
    use DatabaseTransactions;

    private const STARTED = 2;

    protected function setUp(): void {
        parent::setUp();
        $this->buildFlow();
    }
    public function test_configuration_is_admin_only(): void {
        $pm = $this->userWithRole('project_manager');

        $this->asUser($pm)->getJson('/api/flow/config')->assertForbidden();
        $this->asUser($pm)->postJson('/api/flow/config/risk-classes', ['key' => 'x', 'name' => 'X', 'level' => 1, 'release_required_approvals' => 1])->assertForbidden();
        $this->asUser($pm)->getJson('/api/flow/audit')->assertForbidden();
    }
    public function test_index_returns_the_whole_configuration(): void {
        $this->asUser($this->userWithRole('admin'))->getJson('/api/flow/config')
            ->assertOk()
            ->assertJsonStructure(['states', 'transitions', 'phases' => [['gates']], 'risk_classes', 'job_types' => [['jobs_count']], 'roles'])
            ->assertJsonPath('phases.0.gates.0.key', 'architecture');
    }
    public function test_transition_lifecycle_is_validated_and_audited(): void {
        $admin = $this->userWithRole('admin');
        Transition::where('from_state_id', self::QUOTED)->where('to_state_id', self::STARTED)->delete();

        $id = $this->asUser($admin)->postJson('/api/flow/config/transitions', ['from_state_id' => self::QUOTED, 'to_state_id' => self::STARTED])
            ->assertCreated()
            ->json('id');
        $this->asUser($admin)->postJson('/api/flow/config/transitions', ['from_state_id' => self::QUOTED, 'to_state_id' => self::STARTED])->assertJsonValidationErrors('to_state_id');
        $this->asUser($admin)->postJson('/api/flow/config/transitions', ['from_state_id' => self::QUOTED, 'to_state_id' => self::QUOTED])->assertJsonValidationErrors('to_state_id');

        $this->asUser($admin)->putJson("/api/flow/config/transitions/{$id}", ['required_role' => 'nonexistent'])->assertJsonValidationErrors('required_role');
        $this->asUser($admin)->putJson("/api/flow/config/transitions/{$id}", ['to_state_id' => self::PREPARED])->assertJsonValidationErrors('to_state_id');
        $this->asUser($admin)->putJson("/api/flow/config/transitions/{$id}", ['required_role' => 'financial', 'active' => false])
            ->assertOk()
            ->assertJsonPath('required_role', 'financial')
            ->assertJsonPath('active', false);

        $this->asUser($admin)->deleteJson("/api/flow/config/transitions/{$id}")->assertNoContent();
        $this->assertNull(Transition::find($id));

        $entries = AuditEntry::where('subject_type', Transition::class)->where('subject_id', $id)->orderBy('id')->get();
        $this->assertSame(['config.transitions.created', 'config.transitions.updated', 'config.transitions.deleted'], $entries->pluck('action')->all());
        $this->assertSame(['required_role' => null, 'active' => true], $entries[1]->payload['before']);
        $this->assertSame(['required_role' => 'financial', 'active' => false], $entries[1]->payload['after']);
        $this->assertSame($admin->id, $entries[1]->actor_id);
    }
    public function test_invalid_gate_condition_and_job_schema_become_validation_errors(): void {
        $admin = $this->userWithRole('admin');
        $gate  = Gate::where('key', 'architecture')->sole();

        $this->asUser($admin)->putJson("/api/flow/config/gates/{$gate->id}", ['condition' => ['script' => 'x']])->assertJsonValidationErrors('condition');
        $this->asUser($admin)->putJson("/api/flow/config/gates/{$gate->id}", ['condition' => ['risk_level_gte' => 2], 'required_approvals' => null])
            ->assertOk()
            ->assertJsonPath('condition.risk_level_gte', 2);
        $this->asUser($admin)->postJson('/api/flow/config/gates', ['phase_id' => $gate->phase_id, 'key' => 'architecture', 'name' => 'Dup', 'required_role' => 'admin'])->assertJsonValidationErrors('key');

        $type = JobType::byKey('fix');
        $this->asUser($admin)->putJson("/api/flow/config/job-types/{$type->id}", ['input_schema' => ['fields' => [['key' => 'cmd', 'type' => 'shell']]]])->assertJsonValidationErrors('input_schema');
    }
    public function test_phase_needs_a_free_state_and_job_types_in_use_cannot_be_deleted(): void {
        $admin = $this->userWithRole('admin');

        $this->asUser($admin)->postJson('/api/flow/config/phases', ['key' => 'third', 'name' => 'Third', 'project_state_id' => self::PREPARED])->assertJsonValidationErrors('project_state_id');
        $this->asUser($admin)->postJson('/api/flow/config/phases', ['key' => 'third', 'name' => 'Third', 'project_state_id' => self::STARTED, 'sort' => 3])->assertCreated();

        $type = JobType::byKey('fix');
        app(JobStateMachine::class)->create(['project_id' => Project::factory()->create()->id, 'type' => 'fix', 'input' => []], null);
        $this->asUser($admin)->deleteJson("/api/flow/config/job-types/{$type->id}")->assertStatus(409);
    }
    public function test_audit_log_is_paginated_filterable_and_readable(): void {
        $admin = $this->userWithRole('admin');
        $this->asUser($admin)->postJson('/api/flow/config/risk-classes', ['key' => 'extreme', 'name' => 'Extrem', 'level' => 9, 'release_required_approvals' => 3])->assertCreated();
        app(JobStateMachine::class)->create(['project_id' => Project::factory()->create()->id, 'type' => 'fix', 'input' => []], $admin);

        $this->asUser($admin)->getJson('/api/flow/audit?subject=RiskClass')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'config.risk-classes.created')
            ->assertJsonPath('data.0.subject_type', 'RiskClass')
            ->assertJsonPath('data.0.subject_label', 'Extrem')
            ->assertJsonPath('data.0.actor_name', $admin->name)
            ->assertJsonPath('data.0.payload.after.level', 9);

        $this->asUser($admin)->getJson('/api/flow/audit?action=job.')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'job.created')
            ->assertJsonPath('data.0.subject_type', 'Job');

        $this->asUser($admin)->getJson('/api/flow/audit?subject=Risk%25')->assertJsonValidationErrors('subject');
        $this->asUser($admin)->getJson('/api/flow/audit/subject-types')->assertOk()->assertJsonFragment(['RiskClass']);
    }
}
