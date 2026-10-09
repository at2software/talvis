<?php

namespace Tests\Feature\Flow;

use App\Flow\Exceptions\JobTransitionRefused;
use App\Flow\JobStateMachine;
use App\Flow\MachineAbility;
use App\Flow\Models\Approval;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Job;
use App\Flow\Models\JobType;
use App\Flow\Models\RiskClass;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use InvalidArgumentException;
use Tests\Feature\Flow\Concerns\BuildsFlowConfiguration;
use Tests\TestCase;

class JobLifecycleTest extends TestCase {
    use BuildsFlowConfiguration;
    use DatabaseTransactions;

    private Project $project;
    private string $orchestrator;

    protected function setUp(): void {
        parent::setUp();
        $this->buildFlow();
        $this->project      = Project::factory()->create(['flow_risk_class_id' => RiskClass::where('key', 'high')->value('id')]);
        $this->orchestrator = $this->machineToken('orchestrator', MachineAbility::ALL);
    }
    private function createJob(array $input = ['issue' => 'https://git.example.com/acme/shop/-/issues/7']): int {
        return $this->asUser($this->userWithRole('project_manager'))
            ->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => $input])
            ->assertCreated()
            ->assertJsonPath('state', Job::OPEN)
            ->json('id');
    }
    private function claimedJob(): int {
        $id = $this->createJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/claim")->assertOk();
        return $id;
    }
    public function test_job_creation_validates_input_against_the_type_schema(): void {
        $pm = $this->userWithRole('project_manager');

        $this->asUser($pm)->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => []])->assertJsonValidationErrors('input.issue');
        $this->asUser($pm)->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => ['issue' => 'not a url']])->assertJsonValidationErrors('input.issue');
        $this->asUser($pm)->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => ['issue' => 'https://x.test/1', 'shell' => 'rm -rf /']])->assertJsonValidationErrors('input');
        $this->asUser($pm)->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'unknown', 'input' => []])->assertJsonValidationErrors('type');
        $this->asUser($this->userWithRole('user'))->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => ['issue' => 'https://x.test/1']])->assertForbidden();

        $this->createJob(['issue' => 'https://x.test/1', 'labels' => ['bug', 'p1'], 'notes' => 'Customer reported']);
    }
    public function test_full_lifecycle_with_gate_and_release_approval(): void {
        $id = $this->createJob();

        $this->asMachine($this->orchestrator)->getJson('/api/flow/jobs?state=open')
            ->assertOk()
            ->assertJsonPath('0.id', $id)
            ->assertJsonPath('0.project.name', $this->project->name)
            ->assertJsonMissingPath('0.project.net');

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/claim")
            ->assertOk()
            ->assertJsonPath('state', Job::CLAIMED)
            ->assertJsonPath('claimed_by', 'orchestrator');

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture', 'options' => ['patch', 'rewrite'], 'recommendation' => 'patch'])
            ->assertOk()
            ->assertJsonPath('job.state', Job::AWAITING_GATE)
            ->assertJsonPath('approval.decision', Approval::PENDING)
            ->assertJsonPath('approval.context.requested_by_machine', 'orchestrator');

        $approval = Approval::where('subject_type', Job::class)->where('subject_id', $id)->sole();
        $this->assertNull($approval->requested_by_id);

        $this->asMachine($this->orchestrator)->getJson("/api/flow/jobs/{$id}/gates")->assertJsonPath('0.decision', Approval::PENDING);

        $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$approval->id}/approve", ['selected_option' => 'patch'])->assertOk();
        $this->assertSame(Job::RUNNING, Job::find($id)->state);

        $this->asMachine($this->orchestrator)->getJson("/api/flow/jobs/{$id}/gates")
            ->assertJsonPath('0.decision', Approval::APPROVED)
            ->assertJsonPath('0.selected_option', 'patch');

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", [
            'mr_url'      => 'https://git.example.com/acme/shop/-/merge_requests/12',
            'test_report' => '42 passed',
            'metrics'     => ['duration_minutes' => 14, 'cost_eur' => 0.37],
            'knowledge'   => ['root_cause' => 'missing null check'],
        ])
            ->assertOk()
            ->assertJsonPath('job.state', Job::COMPLETED)
            ->assertJsonPath('job.output.mr_url', 'https://git.example.com/acme/shop/-/merge_requests/12')
            ->assertJsonPath('job.metrics.cost_eur', 0.37)
            ->assertJsonPath('release_approval.gate_key', 'release')
            ->assertJsonPath('release_approval.required_approvals', 2);

        $this->assertSame(
            ['job.created', 'job.claimed', 'job.awaiting_gate', 'job.running', 'job.completed'],
            AuditEntry::where('subject_type', Job::class)->where('subject_id', $id)->orderBy('id')->pluck('action')->all()
        );
        $this->assertSame(
            ['user', 'machine', 'machine', 'user', 'machine'],
            AuditEntry::where('subject_type', Job::class)->where('subject_id', $id)->orderBy('id')->pluck('actor_type')->all()
        );
    }
    public function test_second_claim_fails(): void {
        $id = $this->claimedJob();

        $this->asMachine($this->machineToken('competitor', MachineAbility::ALL))->postJson("/api/flow/jobs/{$id}/claim")
            ->assertStatus(409)
            ->assertJsonPath('message', 'The job is already claimed by orchestrator.');
    }
    public function test_only_the_claiming_machine_may_report(): void {
        $id    = $this->claimedJob();
        $other = $this->machineToken('competitor', MachineAbility::ALL);

        $this->asMachine($other)->postJson("/api/flow/jobs/{$id}/fail", ['reason' => 'x'])->assertForbidden();
        $this->asMachine($other)->postJson("/api/flow/jobs/{$id}/result", [])->assertForbidden();
        $this->asMachine($other)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture'])->assertForbidden();
    }
    public function test_failed_job_is_final(): void {
        $id = $this->claimedJob();

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/fail", ['reason' => 'Tests do not compile'])
            ->assertOk()
            ->assertJsonPath('state', Job::FAILED)
            ->assertJsonPath('output.failure_reason', 'Tests do not compile');

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", [])->assertStatus(409);
    }
    public function test_urls_from_machines_and_job_input_must_be_http_or_https(): void {
        $this->asUser($this->userWithRole('project_manager'))
            ->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => ['issue' => 'ftp://files.test/issue']])
            ->assertJsonValidationErrors('input.issue');

        $id = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", ['mr_url' => 'ftp://files.test/mr'])->assertJsonValidationErrors('mr_url');
    }
    public function test_rejected_gate_rejects_the_job(): void {
        $id = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture'])->assertOk();
        $approval = Approval::where('subject_type', Job::class)->where('subject_id', $id)->sole();

        $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$approval->id}/reject", ['reason' => 'Out of scope'])->assertOk();

        $this->assertSame(Job::REJECTED, Job::find($id)->state);
    }
    public function test_gate_request_needs_a_gate_of_the_current_phase(): void {
        $id = $this->claimedJob();

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'deploy'])->assertJsonValidationErrors('gate_key');
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture', 'options' => ['a', 'a']])->assertJsonValidationErrors('options.0');
        $this->assertSame(Job::CLAIMED, Job::find($id)->state);
    }
    public function test_token_scopes_are_enforced_per_endpoint(): void {
        $id     = $this->createJob();
        $reader = $this->machineToken('reader', [MachineAbility::JOBS_READ]);
        $gates  = $this->machineToken('gates', [MachineAbility::GATES_READ]);

        $this->asMachine($reader)->getJson('/api/flow/jobs')->assertOk();
        $this->asMachine($reader)->postJson("/api/flow/jobs/{$id}/claim")->assertForbidden();
        $this->asMachine($reader)->getJson("/api/flow/jobs/{$id}/gates")->assertForbidden();
        $this->asMachine($gates)->getJson("/api/flow/jobs/{$id}/gates")->assertOk();
        $this->asMachine($gates)->getJson('/api/flow/jobs')->assertForbidden();
        $this->asMachine($gates)->getJson("/api/flow/projects/{$this->project->id}/phase")->assertOk();
        $this->assertSame(Job::OPEN, Job::find($id)->state);
    }
    public function test_humans_cannot_use_the_orchestrator_api(): void {
        $id = $this->createJob();

        $admin = $this->userWithRole('admin')->issueApiToken();

        $this->asMachine($admin)->postJson("/api/flow/jobs/{$id}/claim")->assertForbidden();
        $this->asMachine($admin)->getJson('/api/flow/jobs')->assertForbidden();
        $this->asUser($this->userWithRole('admin'))->getJson('/api/flow/jobs')->assertUnauthorized();
    }
    public function test_team_job_list_shows_state_claim_and_last_event(): void {
        $id = $this->claimedJob();

        $this->asUser($this->userWithRole('user'))->getJson("/api/flow/projects/{$this->project->id}/jobs")
            ->assertOk()
            ->assertJsonPath('0.id', $id)
            ->assertJsonPath('0.state', Job::CLAIMED)
            ->assertJsonPath('0.claimed_by', 'orchestrator')
            ->assertJsonPath('0.last_event.action', 'job.claimed')
            ->assertJsonPath('0.last_event.actor_type', 'machine');
    }
    public function test_state_machine_refuses_transitions_outside_the_matrix(): void {
        $job = app(JobStateMachine::class)->create(['project_id' => $this->project->id, 'type' => 'fix', 'input' => []], null);

        $this->expectException(JobTransitionRefused::class);
        app(JobStateMachine::class)->transition($job, Job::COMPLETED, null);
    }
    public function test_job_type_schema_must_be_valid(): void {
        $this->expectException(InvalidArgumentException::class);
        JobType::create(['key' => 'broken', 'name' => 'Broken', 'input_schema' => ['fields' => [['key' => 'cmd', 'type' => 'shell']]]]);
    }
}
