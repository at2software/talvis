<?php

namespace Tests\Feature\Flow\Concerns;

use App\Flow\Models\Gate;
use App\Flow\Models\JobType;
use App\Flow\Models\Machine;
use App\Flow\Models\Phase;
use App\Flow\Models\RiskClass;
use App\Models\User;

trait BuildsFlowConfiguration {
    protected const PREPARED = 1;
    protected const QUOTED   = 6;

    protected Phase $first;
    protected Phase $second;

    protected function buildFlow(): void {
        $this->first  = Phase::create(['key' => 'first', 'name' => 'First', 'project_state_id' => self::PREPARED, 'sort' => 1]);
        $this->second = Phase::create(['key' => 'second', 'name' => 'Second', 'project_state_id' => self::QUOTED, 'sort' => 2]);
        Gate::create(['key' => 'architecture', 'name' => 'Architecture', 'phase_id' => $this->first->id, 'required_role' => 'project_manager', 'required_approvals' => 1, 'condition' => ['always' => true], 'sort' => 1]);
        Gate::create(['key' => 'security', 'name' => 'Security', 'phase_id' => $this->first->id, 'required_role' => 'project_manager', 'required_approvals' => 2, 'condition' => ['risk_level_gte' => 3], 'sort' => 2]);
        Gate::create(['key' => 'release', 'name' => 'Release', 'phase_id' => $this->first->id, 'required_role' => 'project_manager', 'required_approvals' => null, 'condition' => ['risk_level_gte' => 99], 'sort' => 3]);
        RiskClass::create(['key' => 'low', 'name' => 'Low', 'level' => 1, 'release_required_approvals' => 1]);
        RiskClass::create(['key' => 'high', 'name' => 'High', 'level' => 3, 'release_required_approvals' => 2]);
        JobType::create([
            'key'              => 'fix',
            'name'             => 'Fix',
            'review_gate_keys' => ['architecture', 'security'],
            'input_schema'     => ['fields' => [
                ['key' => 'issue', 'type' => 'url', 'required' => true],
                ['key' => 'notes', 'type' => 'text'],
                ['key' => 'labels', 'type' => 'list'],
            ]],
        ]);
    }
    protected function userWithRole(string ...$roles): User {
        $user = User::factory()->create();
        $user->assignRole($roles);
        return $user;
    }
    protected function machineToken(string $name, array $abilities): string {
        return Machine::firstOrCreate(['name' => $name])->createToken($name, $abilities)->plainTextToken;
    }
    protected function asMachine(string $token): static {
        $this->app['auth']->forgetGuards();
        return $this->withHeaders(['Authorization' => 'Bearer '.$token]);
    }
    protected function asUser(User $user): static {
        $this->app['auth']->forgetGuards();
        $this->defaultHeaders = [];
        return $this->actingAs($user);
    }
}
