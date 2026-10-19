<?php

namespace Tests\Feature\Flow;

use App\Flow\Chat\ApprovalChat;
use App\Flow\MachineAbility;
use App\Flow\Models\Approval;
use App\Flow\Models\Job;
use App\Flow\Models\RiskClass;
use App\Http\Controllers\PluginMattermostController;
use App\Jobs\ChatSendMessageJob;
use App\Models\Encryption;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Flow\Concerns\BuildsFlowConfiguration;
use Tests\Feature\Flow\Fakes\FakeMattermost;
use Tests\TestCase;

class MattermostApprovalTest extends TestCase {
    use BuildsFlowConfiguration;
    use DatabaseTransactions;

    private Project $project;
    private string $orchestrator;
    private FakeMattermost $mattermost;

    protected function setUp(): void {
        parent::setUp();
        Bus::fake([ChatSendMessageJob::class]);
        $this->buildFlow();
        $this->project      = Project::factory()->create(['flow_risk_class_id' => RiskClass::where('key', 'high')->value('id')]);
        $this->orchestrator = $this->machineToken('orchestrator', MachineAbility::ALL);
        $this->mattermost   = new FakeMattermost;
        $this->app->instance(PluginMattermostController::class, $this->mattermost);
    }
    private static function mattermostId(): string {
        return Str::lower(Str::random(26));
    }
    private function linked(string ...$roles): array {
        $user = $this->userWithRole(...$roles);
        $id   = self::mattermostId();
        Encryption::create(['key' => 'mattermost', 'value' => 'x', 'user_id' => $user->id, 'my_id' => $id]);
        return [$user, $id];
    }
    private function gateRequest(string $gateKey = 'architecture', array $options = []): Approval {
        $id = $this->asUser($this->userWithRole('project_manager'))
            ->postJson("/api/flow/projects/{$this->project->id}/jobs", ['type' => 'fix', 'input' => ['issue' => 'https://x.test/1']])
            ->json('id');
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/claim")->assertOk();
        $this->asMachine($this->orchestrator)->postJson("/api/flow/jobs/{$id}/gate-request", array_filter(['gate_key' => $gateKey, 'options' => $options]))->assertOk();
        return Approval::where('subject_type', Job::class)->where('subject_id', $id)->sole();
    }
    private function click(string $mattermostId, Approval $approval, string $action, ?string $option = null, ?string $token = null): TestResponse {
        $this->app['auth']->forgetGuards();
        return $this->withHeaders([])->postJson('/api/flow/chat/mattermost/actions', [
            'user_id'    => $mattermostId,
            'post_id'    => 'post1',
            'trigger_id' => 'trigger1',
            'context'    => array_filter(['token' => $token ?? ApprovalChat::token(), 'approval_id' => $approval->id, 'action' => $action, 'option' => $option]),
        ]);
    }
    private function submit(string $mattermostId, string $reason, ?array $state = null): TestResponse {
        $this->app['auth']->forgetGuards();
        return $this->withHeaders([])->postJson('/api/flow/chat/mattermost/dialog', [
            'type'       => 'dialog_submission',
            'user_id'    => $mattermostId,
            'state'      => json_encode($state ?? json_decode(end($this->mattermost->dialogs)['state'], true)),
            'submission' => ['reason' => $reason],
            'cancelled'  => false,
        ]);
    }
    public function test_linking_resolves_the_mattermost_username_and_refuses_duplicates_and_unknown_names(): void {
        $id                                = self::mattermostId();
        $this->mattermost->known['jdoe']   = $id;
        $user                              = $this->userWithRole('user');
        $other                             = $this->userWithRole('user');
        $mine                              = Encryption::create(['key' => 'mattermost', 'value' => 'x', 'user_id' => $user->id]);
        $theirs                            = Encryption::create(['key' => 'mattermost', 'value' => 'x', 'user_id' => $other->id]);

        $this->asUser($user)->putJson("/api/encryptions/{$mine->id}", ['my_id' => '@JDoe'])->assertOk();
        $this->assertSame($id, $mine->fresh()->my_id);
        $this->assertTrue(Encryption::userFor('mattermost', $id)->is($user));

        $this->asUser($other)->putJson("/api/encryptions/{$theirs->id}", ['my_id' => 'jdoe'])->assertJsonValidationErrors('my_id');
        $this->asUser($other)->putJson("/api/encryptions/{$theirs->id}", ['my_id' => 'ghost'])->assertJsonValidationErrors('my_id');
        $this->assertNull($theirs->fresh()->my_id);
    }
    public function test_linked_deciders_get_a_direct_message_with_one_approve_button_per_option(): void {
        [$decider]  = $this->linked('project_manager');
        [$noRole]   = $this->linked('user');
        $unlinked   = $this->userWithRole('project_manager');

        $approval = $this->gateRequest('architecture', ['patch', 'rewrite']);

        $direct = Bus::dispatched(ChatSendMessageJob::class)->filter(fn (ChatSendMessageJob $job) => (fn () => $this->user)->call($job));
        $to     = $direct->map(fn (ChatSendMessageJob $job) => (fn () => $this->user->id)->call($job));
        $this->assertContains($decider->id, $to);
        $this->assertNotContains($noRole->id, $to);
        $this->assertNotContains($unlinked->id, $to);

        $props   = (fn () => $this->props)->call($direct->first(fn (ChatSendMessageJob $job) => (fn () => $this->user->id)->call($job) === $decider->id));
        $actions = $props['attachments'][0]['actions'];
        $this->assertSame(['Approve: patch', 'Approve: rewrite', 'Request changes', 'Reject'], array_column($actions, 'name'));
        $this->assertSame(['token' => ApprovalChat::token(), 'approval_id' => $approval->id, 'action' => ApprovalChat::APPROVE, 'option' => 'rewrite'], $actions[1]['integration']['context']);
        $this->assertStringEndsWith('/flow/chat/mattermost/actions', $actions[0]['integration']['url']);
    }
    public function test_a_click_decides_as_the_linked_talvis_user(): void {
        [$decider, $mattermostId] = $this->linked('project_manager');
        $approval                 = $this->gateRequest('architecture', ['patch', 'rewrite']);

        $this->click($mattermostId, $approval, ApprovalChat::APPROVE, 'rewrite')
            ->assertOk()
            ->assertJsonPath('update.props.attachments.0.text', "✅ Approved by {$decider->name}: rewrite.");

        $approval->refresh();
        $this->assertSame([Approval::APPROVED, 'rewrite', $decider->id], [$approval->decision, $approval->selected_option, $approval->decided_by_id]);
        $this->assertSame(Job::RUNNING, Job::find($approval->subject_id)->state);
    }
    public function test_unlinked_accounts_and_wrong_tokens_are_refused(): void {
        [, $mattermostId] = $this->linked('project_manager');
        $approval         = $this->gateRequest();

        $this->click($mattermostId, $approval, ApprovalChat::APPROVE, token: 'forged')->assertForbidden();
        $this->click(self::mattermostId(), $approval, ApprovalChat::APPROVE)->assertOk()->assertJsonPath('ephemeral_text', fn (string $text) => str_contains($text, 'not linked'));
        $this->submit(self::mattermostId(), 'Rework', ['token' => ApprovalChat::token(), 'approval_id' => $approval->id, 'action' => ApprovalChat::REQUEST_CHANGES])->assertJsonPath('error', fn (string $text) => str_contains($text, 'not linked'));
        $this->submit($mattermostId, 'Rework', ['token' => 'forged', 'approval_id' => $approval->id, 'action' => ApprovalChat::REQUEST_CHANGES])->assertForbidden();

        $this->assertTrue($approval->fresh()->isPending());
        $this->assertSame(0, $approval->votes()->count());
    }
    public function test_the_existing_role_and_four_eyes_checks_apply(): void {
        [, $withoutRole]  = $this->linked('user');
        [, $first]        = $this->linked('project_manager');
        [, $second]       = $this->linked('project_manager');
        $approval         = $this->gateRequest('security');

        $this->click($withoutRole, $approval, ApprovalChat::APPROVE)->assertJsonPath('ephemeral_text', 'Deciding this approval requires the role project_manager.');
        $this->click($first, $approval, ApprovalChat::APPROVE)->assertJsonPath('update.props.attachments.0.text', fn (string $text) => str_contains($text, '(1/2)'));
        $this->click($first, $approval, ApprovalChat::APPROVE)->assertJsonPath('ephemeral_text', fn (string $text) => str_contains($text, 'already decided'));
        $this->assertTrue($approval->fresh()->isPending());

        $this->click($second, $approval, ApprovalChat::APPROVE)->assertOk();
        $this->assertTrue($approval->fresh()->isApproved());
    }
    public function test_request_changes_opens_a_dialog_and_the_reason_sends_the_job_back(): void {
        [$decider, $mattermostId] = $this->linked('project_manager');
        $approval                 = $this->gateRequest();

        $this->click($mattermostId, $approval, ApprovalChat::REQUEST_CHANGES)->assertOk()->assertExactJson([]);
        $this->assertSame('reason', $this->mattermost->dialogs[0]['elements'][0]['name']);

        $this->submit($mattermostId, '  ')->assertJsonPath('errors.reason', 'A reason is required.');
        $this->submit($mattermostId, 'Keep the public API stable')->assertOk()->assertExactJson([]);

        $approval->refresh();
        $this->assertSame([Approval::CHANGES_REQUESTED, 'Keep the public API stable', $decider->id], [$approval->decision, $approval->reason, $approval->decided_by_id]);
        $this->assertSame(Job::RUNNING, Job::find($approval->subject_id)->state);
        $this->assertSame('post1', $this->mattermost->updates[0]['id']);
        $this->assertStringContainsString('Changes requested', $this->mattermost->updates[0]['props']['attachments'][0]['text']);
    }
    public function test_reject_goes_through_the_dialog_too(): void {
        [, $mattermostId] = $this->linked('project_manager');
        $approval         = $this->gateRequest();

        $this->click($mattermostId, $approval, ApprovalChat::REJECT)->assertOk();
        $this->submit($mattermostId, 'Out of scope')->assertOk();

        $this->assertSame(Approval::REJECTED, $approval->fresh()->decision);
        $this->assertSame(Job::REJECTED, Job::find($approval->subject_id)->state);
    }
    public function test_project_gate_approvals_offer_no_request_changes_button(): void {
        [$decider] = $this->linked('project_manager');
        $this->asUser($this->userWithRole('project_manager'))->postJson("/api/flow/projects/{$this->project->id}/gates/architecture/request")->assertCreated();

        $job = Bus::dispatched(ChatSendMessageJob::class)->first(fn (ChatSendMessageJob $job) => (fn () => $this->user?->id)->call($job) === $decider->id);
        $this->assertSame(['Approve', 'Reject'], array_column((fn () => $this->props)->call($job)['attachments'][0]['actions'], 'name'));
    }
}
