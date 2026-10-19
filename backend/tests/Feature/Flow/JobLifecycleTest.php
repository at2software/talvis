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
use App\Jobs\ChatSendMessageJob;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Bus;
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
        Bus::fake([ChatSendMessageJob::class]);
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
    private function reviewsOf(int $id, int $round): Collection {
        return Approval::where('subject_type', Job::class)->where('subject_id', $id)->orderBy('id')->get()->filter(fn (Approval $approval) => $approval->reviewRound() === $round)->values();
    }
    private function decide(Approval $approval, string $action, array $body = [], int $voters = 1): void {
        for ($i = 0; $i < $voters; $i++) {
            $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$approval->id}/{$action}", $body)->assertOk();
        }
    }
    private function jobInReview(): int {
        $id = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", ['mr_url' => 'https://git.example.com/acme/shop/-/merge_requests/12'])->assertOk()->assertJsonPath('job.state', Job::IN_REVIEW);
        return $id;
    }
    private function lastJobEvent(int $id): AuditEntry {
        return AuditEntry::where('subject_type', Job::class)->where('subject_id', $id)->latest('id')->first();
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
    public function test_full_lifecycle_with_gate_and_parallel_review_approvals(): void {
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

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", [
            'gate_key'       => 'architecture',
            'options'        => ['patch', 'rewrite'],
            'recommendation' => 'patch',
            'source'         => 'rule_check',
            'diff_url'       => 'https://git.example.com/acme/shop/-/compare/master...fix-7',
        ])
            ->assertOk()
            ->assertJsonPath('job.state', Job::AWAITING_GATE)
            ->assertJsonPath('approval.decision', Approval::PENDING)
            ->assertJsonPath('approval.context.requested_by_machine', 'orchestrator')
            ->assertJsonPath('approval.context.source', 'rule_check')
            ->assertJsonPath('approval.context.diff_url', 'https://git.example.com/acme/shop/-/compare/master...fix-7')
            ->assertJsonMissingPath('approval.subject');

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
            'mr_urls'     => ['https://git.example.com/acme/shop/-/merge_requests/12', 'https://git.example.com/acme/api/-/merge_requests/3'],
            'test_report' => '42 passed',
            'metrics'     => ['duration_minutes' => 14, 'cost_eur' => 0.37],
            'knowledge'   => ['customer_specific' => ['root_cause' => 'missing null check'], 'general' => ['pitfall' => 'nullable relations']],
        ])
            ->assertOk()
            ->assertJsonPath('job.state', Job::IN_REVIEW)
            ->assertJsonPath('job.output.mr_url', 'https://git.example.com/acme/shop/-/merge_requests/12')
            ->assertJsonPath('job.output.mr_urls.1', 'https://git.example.com/acme/api/-/merge_requests/3')
            ->assertJsonPath('job.metrics.cost_eur', 0.37)
            ->assertJsonPath('job.knowledge.customer_specific.root_cause', 'missing null check')
            ->assertJsonPath('review_approvals.0.gate_key', 'architecture')
            ->assertJsonPath('review_approvals.0.required_approvals', 1)
            ->assertJsonPath('review_approvals.1.gate_key', 'security')
            ->assertJsonPath('review_approvals.1.required_approvals', 2);

        [$architecture, $security] = $this->reviewsOf($id, 1)->all();
        $this->decide($architecture, 'approve');
        $this->assertSame(Job::IN_REVIEW, Job::find($id)->state);
        $this->decide($security, 'approve');
        $this->assertSame(Job::IN_REVIEW, Job::find($id)->state);
        $this->decide($security, 'approve');
        $this->assertSame(Job::COMPLETED, Job::find($id)->state);

        $this->assertSame(
            ['job.created', 'job.claimed', 'job.awaiting_gate', 'job.running', 'job.in_review', 'job.completed'],
            AuditEntry::where('subject_type', Job::class)->where('subject_id', $id)->orderBy('id')->pluck('action')->all()
        );
        $this->assertSame(
            ['user', 'machine', 'machine', 'user', 'machine', 'user'],
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
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", ['mr_urls' => ['https://x.test/1', 'ftp://files.test/mr']])->assertJsonValidationErrors('mr_urls.1');
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture', 'diff_url' => 'javascript:alert(1)', 'source' => 'human'])->assertJsonValidationErrors(['diff_url', 'source']);
    }
    public function test_rejected_gate_rejects_the_job(): void {
        $id = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture'])->assertOk();
        $approval = Approval::where('subject_type', Job::class)->where('subject_id', $id)->sole();

        $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$approval->id}/reject", ['reason' => 'Out of scope'])->assertOk();

        $this->assertSame(Job::REJECTED, Job::find($id)->state);
    }
    public function test_changes_requested_on_a_gate_sends_the_job_back_to_running_with_the_reason(): void {
        $id = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture'])->assertOk();
        $approval = Approval::where('subject_type', Job::class)->where('subject_id', $id)->sole();

        $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/approvals/{$approval->id}/request-changes")->assertJsonValidationErrors('reason');
        $this->decide($approval, 'request-changes', ['reason' => 'Keep the public API stable']);

        $this->assertSame(Job::RUNNING, Job::find($id)->state);
        $this->asMachine($this->orchestrator)->getJson("/api/flow/jobs/{$id}/gates")
            ->assertJsonPath('0.decision', Approval::CHANGES_REQUESTED)
            ->assertJsonPath('0.reason', 'Keep the public API stable')
            ->assertJsonPath('0.review_round', null);
        $this->assertSame([Approval::CHANGES_REQUESTED, 'Keep the public API stable'], [$this->lastJobEvent($id)->payload['decision'], $this->lastJobEvent($id)->payload['reason']]);
        $this->assertSame('Keep the public API stable', AuditEntry::where('subject_type', Approval::class)->where('subject_id', $approval->id)->where('action', 'approval.changes_requested')->sole()->payload['reason']);

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture'])->assertOk()->assertJsonPath('job.state', Job::AWAITING_GATE);
        $this->assertSame(2, Approval::where('subject_type', Job::class)->where('subject_id', $id)->count());
    }
    public function test_changes_requested_on_a_review_withdraws_the_round_and_a_new_result_opens_the_next_one(): void {
        $id                        = $this->jobInReview();
        [$architecture, $security] = $this->reviewsOf($id, 1)->all();

        $this->decide($architecture, 'request-changes', ['reason' => 'Add a regression test']);

        $this->assertSame(Job::RUNNING, Job::find($id)->state);
        $this->assertSame(Approval::WITHDRAWN, $security->fresh()->decision);
        $this->asUser($this->userWithRole('project_manager'))->getJson('/api/flow/approvals')->assertJsonCount(0);
        $this->asMachine($this->orchestrator)->getJson("/api/flow/jobs/{$id}/gates")
            ->assertJsonPath('0.decision', Approval::CHANGES_REQUESTED)
            ->assertJsonPath('0.reason', 'Add a regression test')
            ->assertJsonPath('0.review_round', 1);

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", ['mr_url' => 'https://git.example.com/acme/shop/-/merge_requests/12'])
            ->assertOk()
            ->assertJsonPath('job.state', Job::IN_REVIEW)
            ->assertJsonCount(2, 'review_approvals');

        [$architecture, $security] = $this->reviewsOf($id, 2)->all();
        $this->decide($architecture, 'approve');
        $this->decide($security, 'approve', voters: 2);
        $this->assertSame(Job::COMPLETED, Job::find($id)->state);
    }
    public function test_a_rejected_review_rejects_the_job_and_withdraws_the_rest(): void {
        $id                        = $this->jobInReview();
        [$architecture, $security] = $this->reviewsOf($id, 1)->all();

        $this->decide($security, 'approve');
        $this->decide($architecture, 'reject', ['reason' => 'Wrong approach']);

        $this->assertSame(Job::REJECTED, Job::find($id)->state);
        $this->assertSame(Approval::WITHDRAWN, $security->fresh()->decision);
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", [])->assertStatus(409);
    }
    public function test_the_orchestrator_can_fail_a_job_in_review_and_its_open_reviews_are_withdrawn(): void {
        $id                        = $this->jobInReview();
        [$architecture, $security] = $this->reviewsOf($id, 1)->all();
        $this->decide($architecture, 'approve');

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/fail", ['reason' => 'Merge request was closed upstream'])
            ->assertOk()
            ->assertJsonPath('state', Job::FAILED);

        $this->assertSame([Approval::APPROVED, Approval::WITHDRAWN], [$architecture->fresh()->decision, $security->fresh()->decision]);
        $this->asUser($this->userWithRole('project_manager'))->getJson('/api/flow/approvals')->assertJsonCount(0);
    }
    public function test_a_job_without_applicable_review_gates_completes_on_result(): void {
        JobType::byKey('fix')->update(['review_gate_keys' => ['security']]);
        $this->project->forceFill(['flow_risk_class_id' => RiskClass::where('key', 'low')->value('id')])->save();
        $id = $this->claimedJob();

        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", [])
            ->assertOk()
            ->assertJsonPath('job.state', Job::COMPLETED)
            ->assertJsonCount(0, 'review_approvals');
        $this->assertSame(['job.completed', 'no_review_gates'], [$this->lastJobEvent($id)->action, $this->lastJobEvent($id)->payload['reason']]);
    }
    public function test_every_new_gate_or_review_approval_is_announced_in_the_project_chat(): void {
        $id = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", ['gate_key' => 'architecture', 'source' => 'agent'])->assertOk();
        $this->decide(Approval::where('subject_type', Job::class)->where('subject_id', $id)->sole(), 'approve');
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/result", [])->assertOk();

        $messages = Bus::dispatched(ChatSendMessageJob::class)->filter(fn (ChatSendMessageJob $job) => (fn () => $this->project)->call($job))->map(fn (ChatSendMessageJob $job) => (fn () => $this->message)->call($job))->values();
        $this->assertCount(3, $messages);
        $this->assertStringContainsString('Approval requested: `architecture`', $messages[0]);
        $this->assertStringContainsString("**Project**: {$this->project->name}", $messages[0]);
        $this->assertStringContainsString('**Source**: agent', $messages[0]);
        $this->assertStringContainsString('/flow/approvals)', $messages[0]);
        $this->assertStringContainsString('**Source**: review', $messages[1]);
        $this->assertStringContainsString('Approval requested: `security`', $messages[2]);
    }
    public function test_a_machine_finds_its_own_claims_by_default(): void {
        $mine       = $this->claimedJob();
        $competitor = $this->machineToken('competitor', MachineAbility::ALL);
        $theirs     = $this->createJob();
        $this->asMachine($competitor)->postJson("/api/flow/jobs/{$theirs}/claim")->assertOk();
        $open = $this->createJob();

        $this->asMachine($this->orchestrator)->getJson('/api/flow/jobs?state=claimed')->assertJsonCount(1)->assertJsonPath('0.id', $mine);
        $this->asMachine($this->orchestrator)->getJson('/api/flow/jobs?state=running')->assertJsonCount(0);
        $this->asMachine($this->orchestrator)->getJson('/api/flow/jobs?state=claimed&claimed_by=competitor')->assertJsonCount(1)->assertJsonPath('0.id', $theirs);
        $this->asMachine($this->orchestrator)->getJson('/api/flow/jobs')->assertJsonCount(1)->assertJsonPath('0.id', $open);
    }
    public function test_stale_claims_go_back_to_open_after_the_ttl(): void {
        $stale   = $this->claimedJob();
        $waiting = $this->claimedJob();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$waiting}/gate-request", ['gate_key' => 'architecture'])->assertOk();
        $this->travel(config('flow.claim_ttl_hours') + 1)->hours();
        $fresh = $this->claimedJob();

        $this->artisan('flow:release-stale-claims')->assertSuccessful();

        $job = Job::find($stale);
        $this->assertSame([Job::OPEN, null, null], [$job->state, $job->claimed_by, $job->claimed_at]);
        $this->assertSame(Job::CLAIMED, Job::find($fresh)->state);
        $this->assertSame(Job::AWAITING_GATE, Job::find($waiting)->state);
        $entry = $this->lastJobEvent($stale);
        $this->assertSame(['job.open', 'system', 'claim_ttl', 'orchestrator'], [$entry->action, $entry->actor_type, $entry->payload['reason'], $entry->payload['claimed_by']]);

        $this->asUser($this->userWithRole('admin'))->getJson('/api/flow/audit?actor_type=system')->assertJsonPath('data.0.action', 'job.open');
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$stale}/result", [])->assertForbidden();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$stale}/claim")->assertOk();
    }
    public function test_list_items_with_fields_and_required_without_are_validated(): void {
        JobType::create(['key' => 'multi', 'name' => 'Multi', 'input_schema' => ['fields' => [
            ['key' => 'repo', 'type' => 'url', 'required_without' => 'repos'],
            ['key' => 'repos', 'type' => 'list', 'fields' => [['key' => 'url', 'type' => 'url', 'required' => true], ['key' => 'role', 'type' => 'string']]],
        ]]]);
        $store = fn (array $input) => $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'multi', 'input' => $input]);

        $store([])->assertJsonValidationErrors('input.repo');
        $store(['repos' => [['role' => 'api']]])->assertJsonValidationErrors('input.repos.0.url');
        $store(['repos' => [['url' => 'ftp://x.test/repo']]])->assertJsonValidationErrors('input.repos.0.url');
        $store(['repos' => [['url' => 'https://x.test/repo', 'shell' => 'rm -rf /']]])->assertJsonValidationErrors('input.repos.0');
        $store(['repos' => ['https://x.test/repo']])->assertJsonValidationErrors('input.repos.0');
        $store(['repo' => 'https://x.test/repo'])->assertCreated();
        $store(['repos' => [['url' => 'https://x.test/api', 'role' => 'backend'], ['url' => 'https://x.test/ui']]])->assertCreated()->assertJsonPath('input.repos.0.role', 'backend');
    }
    public function test_job_type_schema_rejects_bad_item_fields_and_required_without(): void {
        foreach ([
            [['key' => 'a', 'type' => 'url', 'required_without' => 'missing']],
            [['key' => 'a', 'type' => 'string', 'fields' => [['key' => 'b', 'type' => 'string']]]],
            [['key' => 'a', 'type' => 'list', 'fields' => [['key' => 'b', 'type' => 'list']]]],
        ] as $fields) {
            try {
                JobType::create(['key' => 'broken', 'name' => 'Broken', 'input_schema' => ['fields' => $fields]]);
                $this->fail('Expected the schema to be refused: '.json_encode($fields));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
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
        $this->asMachine($gates)->getJson('/api/flow/phases')->assertJsonPath('job_states.in_review', [Job::COMPLETED, Job::REJECTED, Job::RUNNING, Job::FAILED]);
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
