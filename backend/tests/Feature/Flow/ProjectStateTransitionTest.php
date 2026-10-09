<?php

namespace Tests\Feature\Flow;

use App\Events\ProjectStateTransitioned;
use App\Events\ProjectStateTransitioning;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Transition;
use App\Models\Project;
use App\Models\ProjectProjectState;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ProjectStateTransitionTest extends TestCase {
    use DatabaseTransactions;

    private const PREPARED = 1;
    private const QUOTED   = 6;
    private const FINISHED = 3;

    protected function setUp(): void {
        parent::setUp();
        Bus::fake();
    }
    private function userWithRole(string ...$roles): User {
        $user = User::factory()->create();
        $user->assignRole($roles);
        return $user;
    }
    private function project(): Project {
        return Project::factory()->create();
    }
    public function test_allowed_transition_records_actor_reason_and_audit_entry(): void {
        $pm      = $this->userWithRole('project_manager');
        $project = $this->project();

        $this->actingAs($pm)->putJson("/api/projects/{$project->id}", ['state' => self::QUOTED, 'reason' => 'Quote accepted'])->assertOk();

        $history = ProjectProjectState::where('project_id', $project->id)->latest('id')->first();
        $this->assertSame(self::QUOTED, $history->project_state_id);
        $this->assertSame($pm->id, $history->user_id);
        $this->assertSame('Quote accepted', $history->reason);

        $audit = AuditEntry::where('subject_type', Project::class)->where('subject_id', $project->id)->sole();
        $this->assertSame('project.state_changed', $audit->action);
        $this->assertSame('user', $audit->actor_type);
        $this->assertSame($pm->id, $audit->actor_id);
        $this->assertSame(['from_state_id' => self::PREPARED, 'to_state_id' => self::QUOTED, 'reason' => 'Quote accepted'], $audit->payload);
    }
    public function test_transition_outside_the_matrix_is_rejected(): void {
        $project = $this->project();

        $this->actingAs($this->userWithRole('project_manager'))
            ->putJson("/api/projects/{$project->id}", ['state' => self::FINISHED])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('state');

        $this->assertSame(self::PREPARED, $project->fresh()->state->id);
    }
    public function test_inactive_transition_is_rejected(): void {
        Transition::between(self::PREPARED, self::QUOTED)->update(['active' => false]);
        $project = $this->project();

        $this->actingAs($this->userWithRole('project_manager'))
            ->putJson("/api/projects/{$project->id}", ['state' => self::QUOTED])
            ->assertJsonValidationErrors('state');
    }
    public function test_transition_with_required_role_needs_that_role(): void {
        Transition::between(self::PREPARED, self::QUOTED)->update(['required_role' => 'financial']);
        $project = $this->project();

        $this->actingAs($this->userWithRole('project_manager'))
            ->putJson("/api/projects/{$project->id}", ['state' => self::QUOTED])
            ->assertJsonValidationErrors('state');

        $this->actingAs($this->userWithRole('project_manager', 'financial'))
            ->putJson("/api/projects/{$project->id}", ['state' => self::QUOTED])
            ->assertOk();
    }
    public function test_resubmitting_the_current_state_adds_no_history_row(): void {
        $project = $this->project();

        $this->actingAs($this->userWithRole('project_manager'))
            ->putJson("/api/projects/{$project->id}", ['state' => self::PREPARED])
            ->assertOk();

        $this->assertSame(1, ProjectProjectState::where('project_id', $project->id)->count());
    }
    public function test_listener_can_veto_a_transition_and_nothing_is_saved(): void {
        Event::listen(ProjectStateTransitioning::class, fn (ProjectStateTransitioning $event) => $event->reject('Gate "architecture" is not approved.'));
        $project = $this->project();

        $this->actingAs($this->userWithRole('project_manager'))
            ->putJson("/api/projects/{$project->id}", ['state' => self::QUOTED, 'po_number' => 'PO-1'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.state.0', 'Gate "architecture" is not approved.');

        $project->refresh();
        $this->assertSame(self::PREPARED, $project->state->id);
        $this->assertNull($project->po_number);
        $this->assertSame(0, AuditEntry::where('subject_id', $project->id)->where('subject_type', Project::class)->count());
    }
    public function test_transitioned_event_carries_both_states_and_the_actor(): void {
        Event::fake([ProjectStateTransitioned::class]);
        $pm      = $this->userWithRole('project_manager');
        $project = $this->project();

        $this->actingAs($pm)->putJson("/api/projects/{$project->id}", ['state' => self::QUOTED])->assertOk();

        Event::assertDispatched(ProjectStateTransitioned::class, fn ($event) => $event->from->id === self::PREPARED
            && $event->to->id === self::QUOTED
            && $event->actor->is($pm));
    }
    public function test_transition_matrix_is_readable_by_any_user(): void {
        $this->getJson('/api/flow/transitions')->assertUnauthorized();

        $response = $this->actingAs($this->userWithRole('user'))->getJson('/api/flow/transitions')->assertOk();

        $this->assertContains(['from_state_id' => self::PREPARED, 'to_state_id' => self::QUOTED], array_map(
            fn ($row) => ['from_state_id' => $row['from_state_id'], 'to_state_id' => $row['to_state_id']],
            $response->json()
        ));
    }
    public function test_project_states_can_only_be_edited_by_admins(): void {
        $this->actingAs($this->userWithRole('project_manager'))
            ->putJson('/api/project_states/'.self::QUOTED, ['color' => '#000000'])
            ->assertForbidden();

        $this->actingAs($this->userWithRole('admin'))
            ->putJson('/api/project_states/'.self::QUOTED, ['color' => '#000000'])
            ->assertOk();
    }
    public function test_audit_entries_are_append_only(): void {
        $entry = AuditEntry::record($this->project(), 'test', null);

        $this->expectException(\LogicException::class);
        $entry->update(['action' => 'changed']);
    }
}
