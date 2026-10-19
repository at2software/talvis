<?php

namespace Tests\Feature\Flow;

use App\Enums\VacationState;
use App\Flow\ApprovalService;
use App\Flow\Exceptions\ApprovalRefused;
use App\Flow\MachineAbility;
use App\Flow\Models\Approval;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Machine;
use App\Jobs\ChatSendMessageJob;
use App\Models\Project;
use App\Models\User;
use App\Models\Vacation;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Mail;
use ReflectionMethod;
use Tests\TestCase;

class ApprovalTest extends TestCase {
    use DatabaseTransactions;

    private ApprovalService $approvals;

    protected function setUp(): void {
        parent::setUp();
        $this->approvals = app(ApprovalService::class);
        Mail::fake();
        Bus::fake([ChatSendMessageJob::class]);
    }
    private function userWithRole(string ...$roles): User {
        $user = User::factory()->create();
        $user->assignRole($roles);
        return $user;
    }
    private function refusal(callable $decide): ApprovalRefused {
        try {
            $decide();
        } catch (ApprovalRefused $e) {
            return $e;
        }
        $this->fail('Expected the decision to be refused.');
    }
    public function test_single_approval_is_decided_by_one_approver_and_audited(): void {
        $requester = $this->userWithRole('project_manager');
        $approver  = $this->userWithRole('project_manager');
        $approval  = $this->approvals->request(Project::factory()->create(), 'project_manager', $requester);

        $this->assertTrue($approval->isPending());
        $this->approvals->approve($approval, $approver, 'Looks good');

        $approval->refresh();
        $this->assertTrue($this->approvals->isSatisfied($approval));
        $this->assertSame($approver->id, $approval->decided_by_id);
        $this->assertNotNull($approval->decided_at);
        $this->assertSame(
            ['approval.requested', 'approval.voted', 'approval.approved'],
            AuditEntry::where('subject_type', Approval::class)->where('subject_id', $approval->id)->orderBy('id')->pluck('action')->all()
        );
    }
    public function test_requester_cannot_decide_their_own_request(): void {
        $requester = $this->userWithRole('project_manager');
        $approval  = $this->approvals->request(Project::factory()->create(), 'project_manager', $requester);

        $this->assertSame(403, $this->refusal(fn () => $this->approvals->approve($approval, $requester))->render()->getStatusCode());
        $this->assertTrue($approval->fresh()->isPending());
    }
    public function test_decider_needs_the_required_role(): void {
        $approval = $this->approvals->request(Project::factory()->create(), 'financial', $this->userWithRole('project_manager'));

        $this->refusal(fn () => $this->approvals->approve($approval, $this->userWithRole('project_manager')));
        $this->approvals->approve($approval, $this->userWithRole('admin'));

        $this->assertTrue($approval->fresh()->isApproved());
    }
    public function test_four_eyes_needs_two_different_approvers(): void {
        $first    = $this->userWithRole('project_manager');
        $second   = $this->userWithRole('project_manager');
        $approval = $this->approvals->request(Project::factory()->create(), 'project_manager', $this->userWithRole('user'), 2);

        $this->approvals->approve($approval, $first);
        $this->assertTrue($approval->fresh()->isPending());

        $this->assertSame(409, $this->refusal(fn () => $this->approvals->approve($approval, $first))->render()->getStatusCode());
        $this->assertTrue($approval->fresh()->isPending());

        $this->approvals->approve($approval, $second);
        $approval->refresh();
        $this->assertTrue($approval->isApproved());
        $this->assertSame($second->id, $approval->decided_by_id);
        $this->assertSame(2, $approval->votes()->count());
    }
    public function test_one_rejection_decides_and_closes_the_approval(): void {
        $approval = $this->approvals->request(Project::factory()->create(), 'project_manager', null, 2);

        $this->approvals->reject($approval, $this->userWithRole('project_manager'), 'Missing tests');
        $this->assertSame(Approval::REJECTED, $approval->fresh()->decision);

        $this->assertSame(409, $this->refusal(fn () => $this->approvals->approve($approval, $this->userWithRole('project_manager')))->render()->getStatusCode());
    }
    public function test_changes_can_only_be_requested_on_job_approvals(): void {
        $approval = $this->approvals->request(Project::factory()->create(), 'project_manager', null, 1, 'architecture');

        $this->assertSame(422, $this->refusal(fn () => $this->approvals->requestChanges($approval, $this->userWithRole('project_manager'), 'Rework'))->render()->getStatusCode());
        $this->assertTrue($approval->fresh()->isPending());
    }
    public function test_only_gate_approvals_of_projects_and_jobs_are_announced_in_chat(): void {
        $project = Project::factory()->create();
        $this->approvals->request($project, 'project_manager', $this->userWithRole('project_manager'), 1, 'architecture');
        $this->approvals->request($project, 'project_manager', null);

        $this->assertCount(1, Bus::dispatched(ChatSendMessageJob::class)->filter(fn (ChatSendMessageJob $job) => (fn () => $this->project)->call($job)));
    }
    public function test_selected_option_must_be_one_of_the_offered_options(): void {
        $approval = $this->approvals->request(Project::factory()->create(), 'project_manager', null, 1, 'architecture', ['options' => ['monolith', 'services']]);
        $approver = $this->userWithRole('project_manager');

        $this->assertSame(422, $this->refusal(fn () => $this->approvals->approve($approval, $approver, null, 'serverless'))->render()->getStatusCode());
        $this->approvals->approve($approval, $approver, null, 'services');

        $this->assertSame('services', $approval->fresh()->selected_option);
    }
    public function test_machines_cannot_decide_approvals(): void {
        $this->assertSame(User::class, (new ReflectionMethod(ApprovalService::class, 'approve'))->getParameters()[1]->getType()->getName());

        $approval = $this->approvals->request(Project::factory()->create(), 'project_manager', null);
        $token    = Machine::create(['name' => 'orchestrator'])->createToken('orchestrator', MachineAbility::ALL)->plainTextToken;

        $this->withHeaders(['Authorization' => 'Bearer '.$token])
            ->postJson("/api/flow/approvals/{$approval->id}/approve")
            ->assertUnauthorized();
        $this->assertTrue($approval->fresh()->isPending());
    }
    public function test_approval_api_lists_what_the_user_may_decide_and_decides_it(): void {
        $pm        = $this->userWithRole('project_manager');
        $project   = Project::factory()->create();
        $decidable = $this->approvals->request($project, 'project_manager', null);
        $this->approvals->request($project, 'financial', null);
        $this->approvals->request($project, 'project_manager', $pm);

        $this->actingAs($pm)->getJson('/api/flow/approvals')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', $decidable->id)
            ->assertJsonPath('0.subject_label', $project->name)
            ->assertJsonPath('0.subject_link', "/projects/{$project->id}");

        $this->actingAs($pm)->postJson("/api/flow/approvals/{$decidable->id}/reject")->assertJsonValidationErrors('reason');
        $this->actingAs($pm)->postJson("/api/flow/approvals/{$decidable->id}/approve", ['reason' => 'ok'])
            ->assertOk()
            ->assertJsonPath('decision', Approval::APPROVED);
        $this->actingAs($pm)->getJson('/api/flow/approvals')->assertJsonCount(0);
    }
    public function test_hr_vacation_approval_runs_through_the_service_and_keeps_the_vacation_fields(): void {
        $hr       = $this->userWithRole('hr');
        $vacation = Vacation::factory()->forUser($this->userWithRole('user')->id)->create(['state' => VacationState::Open]);

        $this->actingAs($hr)->putJson("/api/vacations/{$vacation->id}/approve", ['state' => VacationState::Approved->value])->assertOk();

        $vacation->refresh();
        $this->assertSame(VacationState::Approved, $vacation->state);
        $this->assertSame($hr->id, $vacation->approved_by_id);
        $this->assertNotNull($vacation->approved_at);

        $approval = Approval::where('subject_type', Vacation::class)->where('subject_id', $vacation->id)->sole();
        $this->assertTrue($approval->isApproved());
        $this->assertSame('hr', $approval->required_role);
        $this->assertSame($hr->id, $approval->decided_by_id);
    }
    public function test_hr_can_still_reject_and_later_reverse_and_decide_their_own_vacation(): void {
        $hr       = $this->userWithRole('hr');
        $vacation = Vacation::factory()->forUser($hr->id)->create(['state' => VacationState::Open]);

        $this->actingAs($hr)->putJson("/api/vacations/{$vacation->id}/approve", ['state' => VacationState::NotApproved->value, 'reason' => 'Busy week'])->assertOk();
        $this->assertSame(VacationState::NotApproved, $vacation->fresh()->state);

        $this->actingAs($hr)->putJson("/api/vacations/{$vacation->id}/approve", ['state' => VacationState::Approved->value])->assertOk();
        $this->assertSame(VacationState::Approved, $vacation->fresh()->state);

        $this->assertSame(
            [Approval::REJECTED, Approval::APPROVED],
            Approval::where('subject_type', Vacation::class)->where('subject_id', $vacation->id)->orderBy('id')->pluck('decision')->all()
        );
    }
    public function test_hr_cancelling_a_vacation_creates_no_approval(): void {
        $vacation = Vacation::factory()->forUser($this->userWithRole('user')->id)->create(['state' => VacationState::Open]);

        $this->actingAs($this->userWithRole('hr'))->putJson("/api/vacations/{$vacation->id}/approve", ['state' => VacationState::Cancelled->value])->assertOk();

        $this->assertSame(VacationState::Cancelled, $vacation->fresh()->state);
        $this->assertSame(0, Approval::where('subject_type', Vacation::class)->where('subject_id', $vacation->id)->count());
    }
}
