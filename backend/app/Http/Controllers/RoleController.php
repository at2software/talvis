<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Role;

class RoleController extends Controller {
    public function index(): array {
        return [
            'roles' => Role::orderBy('id')->get(['id', 'name', 'description'])->toArray(),
            'users' => User::with(['activeEmployment', 'roles'])
                ->where('id', '!=', 1)
                ->get()
                ->map(fn ($u) => [
                    'id'         => $u->id,
                    'name'       => $u->name,
                    'email'      => $u->email,
                    'icon'       => $u->icon,
                    'is_retired' => $u->is_retired,
                    'role_names' => $u->getRoleNames()->values()->toArray(),
                ])
                ->sortBy('is_retired')
                ->values()
                ->toArray(),
        ];
    }
    public function assign(Role $role, User $user): array {
        abort_if($user->id == 1, 403, 'Cannot modify superadmin.');
        abort_if(Auth::id() == $user->id && $role->name === 'admin', 403, 'Cannot remove your own admin role.');

        $user->assignRole($role->name);
        Cache::forget('roles');
        return $this->index();
    }
    public function remove(Role $role, User $user): array {
        abort_if($user->id == 1, 403, 'Cannot modify superadmin.');
        abort_if(Auth::id() == $user->id && $role->name === 'admin', 403, 'Cannot remove your own admin role.');

        $user->removeRole($role->name);
        Cache::forget('roles');
        return $this->index();
    }
}
