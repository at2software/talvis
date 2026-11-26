<?php

namespace Tests\Feature\Http;

use App\Models\AssignmentRole;
use App\Models\Company;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Bus;
use PHPUnit\Framework\Attributes\Group;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

#[Group('database')]
class AssignmentRolesTest extends TestCase {
    use DatabaseTransactions;

    protected function setUp(): void {
        parent::setUp();
        Bus::fake();
        Role::findOrCreate('project_manager', 'api');
    }
    private function roleIds(string ...$names): array {
        return collect($names)->map(fn ($name) => AssignmentRole::firstOrCreate(['name' => $name])->id)->sort()->values()->all();
    }
    public function test_the_creator_of_a_new_project_is_its_project_manager(): void {
        $creator = User::factory()->create();
        $this->actingAs($creator);

        $project = Company::factory()->create()->createProject('Shop');

        $this->assertSame([AssignmentRole::PROJECT_MANAGER], $project->assignees()->whereAssignee($creator)->sole()->role_names);
    }
    public function test_a_project_manager_may_give_an_assignee_several_roles_and_take_them_all_away(): void {
        $manager    = User::factory()->create();
        $manager->assignRole('project_manager');
        $assignment = Project::factory()->create()->addAssignee(User::factory()->create(), AssignmentRole::DEVELOPER);
        $roleIds    = $this->roleIds(AssignmentRole::LEAD_DEVELOPER, AssignmentRole::SECURITY, AssignmentRole::UI_UX);

        $this->actingAs($manager)->putJson("/api/assignments/{$assignment->id}", ['role_ids' => array_reverse($roleIds)])
            ->assertOk()
            ->assertJsonPath('role_ids', $roleIds);
        $this->putJson("/api/assignments/{$assignment->id}", ['role_ids' => []])->assertOk()->assertJsonPath('role_ids', []);

        $this->assertSame([], $assignment->fresh()->role_ids);
    }
    public function test_an_assignee_may_save_their_hours_but_not_change_their_roles(): void {
        $user       = User::factory()->create();
        $assignment = Project::factory()->create()->addAssignee($user, AssignmentRole::DEVELOPER);
        $unchanged  = $assignment->role_ids;

        $this->actingAs($user)->putJson("/api/assignments/{$assignment->id}", ['role_ids' => $unchanged, 'hours_weekly' => 4])->assertOk();
        $this->putJson("/api/assignments/{$assignment->id}", ['role_ids' => $this->roleIds(AssignmentRole::LEAD_DEVELOPER)])->assertForbidden();

        $this->assertSame($unchanged, $assignment->fresh()->role_ids);
    }
}
