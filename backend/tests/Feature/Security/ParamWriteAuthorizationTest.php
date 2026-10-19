<?php

namespace Tests\Feature\Security;

use App\Models\Param;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ParamWriteAuthorizationTest extends TestCase {
    use DatabaseTransactions;

    private function userWithRoles(string ...$roles): User {
        $user     = new User;
        $user->id = 1;
        return $user->setRelation('roles', collect($roles)->map(fn ($name) => new Role(['name' => $name])));
    }
    public function test_global_params_are_admin_only_by_default(): void {
        $this->actingAs($this->userWithRoles('project_manager'));

        $this->putJson('/api/params/INVOICE_NO_CURRENT', ['value' => 1])->assertForbidden();
        $this->postJson('/api/params/INVOICE_NO_CURRENT', ['value' => 1])->assertForbidden();
        $this->deleteJson('/api/params/INVOICE_NO_CURRENT')->assertForbidden();
    }
    public function test_roles_from_the_param_config_grant_write_access(): void {
        $this->assertTrue(Param::isWritableBy('MARKETING_DOCUMENTS_DESC', $this->userWithRoles('marketing')));
        $this->assertFalse(Param::isWritableBy('INVOICE_NO_CURRENT', $this->userWithRoles('marketing')));
        $this->assertTrue(Param::isWritableBy('INVOICE_NO_CURRENT', $this->userWithRoles('admin')));
    }
    public function test_user_params_of_another_user_are_forbidden(): void {
        $this->actingAs($this->userWithRoles('hr', 'project_manager'));

        $this->getJson('/api/users/2/params/WEBDAV_TOKEN')->assertForbidden();
        $this->getJson('/api/users/2/params/WEBDAV_TOKEN/history')->assertForbidden();
        $this->postJson('/api/users/2/params/WEBDAV_TOKEN', ['value' => 'x'])->assertForbidden();
        $this->putJson('/api/users/2/params/WEBDAV_TOKEN', ['value' => 'x'])->assertForbidden();
        $this->deleteJson('/api/users/2/params/WEBDAV_TOKEN')->assertForbidden();
    }
    public function test_writing_a_param_of_an_unknown_model_type_is_not_found(): void {
        $this->actingAs($this->userWithRoles('admin'));

        $this->postJson('/api/params/KEY/type/1', ['value' => 'x'])->assertNotFound();
        $this->putJson('/api/params/KEY/type/1', ['value' => 'x'])->assertNotFound();
    }
}
