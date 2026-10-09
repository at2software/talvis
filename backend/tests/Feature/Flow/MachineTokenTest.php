<?php

namespace Tests\Feature\Flow;

use App\Flow\MachineAbility;
use App\Flow\Models\Machine;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class MachineTokenTest extends TestCase {
    use DatabaseTransactions;

    private function token(array $abilities, ?\DateTimeInterface $expiresAt = null, string $name = 'orchestrator'): string {
        return Machine::firstOrCreate(['name' => $name])->createToken($name, $abilities, $expiresAt)->plainTextToken;
    }
    private function bearer(string $token): array {
        return ['Authorization' => 'Bearer '.$token];
    }
    public function test_issue_command_creates_a_hashed_token_with_the_given_abilities(): void {
        $exit = Artisan::call('flow:token:issue', ['name' => 'ci-runner', '--ability' => [MachineAbility::JOBS_READ, MachineAbility::JOBS_WRITE], '--expires-days' => 30]);
        $this->assertSame(0, $exit);

        $plain = collect(explode("\n", Artisan::output()))->first(fn ($line) => str_contains($line, '|'));
        $row   = Machine::where('name', 'ci-runner')->sole()->tokens()->sole();
        $this->assertSame([MachineAbility::JOBS_READ, MachineAbility::JOBS_WRITE], $row->abilities);
        $this->assertSame(hash('sha256', explode('|', trim($plain), 2)[1]), $row->token);
        $this->assertStringNotContainsString($row->token, $plain);
        $this->assertTrue($row->expires_at->between(now()->addDays(29), now()->addDays(31)));
    }
    public function test_issue_command_refuses_abilities_outside_the_flow_set(): void {
        foreach ([['flow:approvals:write'], ['*'], []] as $abilities) {
            $this->assertSame(1, Artisan::call('flow:token:issue', ['name' => 'evil', '--ability' => $abilities]));
        }
        $this->assertSame(0, Machine::where('name', 'evil')->count());
    }
    public function test_revoke_command_deletes_every_token_of_the_machine(): void {
        $token = $this->token([MachineAbility::JOBS_READ]);
        $this->token([MachineAbility::GATES_READ]);

        $this->assertSame(0, Artisan::call('flow:token:revoke', ['name' => 'orchestrator']));

        $this->assertSame(0, PersonalAccessToken::where('tokenable_type', Machine::class)->count());
        $this->app['auth']->forgetGuards();
        $this->withHeaders($this->bearer($token))->getJson('/api/flow/machine/me')->assertUnauthorized();
    }
    public function test_machine_token_reaches_machine_routes(): void {
        $this->withHeaders($this->bearer($this->token([MachineAbility::JOBS_READ])))
            ->getJson('/api/flow/machine/me')
            ->assertOk()
            ->assertJsonPath('machine', 'orchestrator')
            ->assertJsonPath('abilities', [MachineAbility::JOBS_READ]);
    }
    public function test_ability_is_checked_per_route(): void {
        $this->withHeaders($this->bearer($this->token([MachineAbility::JOBS_READ])))
            ->getJson('/api/flow/transitions')
            ->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->withHeaders($this->bearer($this->token([MachineAbility::GATES_READ], name: 'reader')))
            ->getJson('/api/flow/transitions')
            ->assertOk();
    }
    public function test_wildcard_token_is_rejected_even_if_created_outside_the_command(): void {
        $this->withHeaders($this->bearer($this->token(['*'])))
            ->getJson('/api/flow/machine/me')
            ->assertForbidden();
    }
    public function test_expired_machine_token_is_rejected(): void {
        $this->withHeaders($this->bearer($this->token([MachineAbility::JOBS_READ], now()->subMinute())))
            ->getJson('/api/flow/machine/me')
            ->assertUnauthorized();
    }
    public function test_machine_token_cannot_use_user_endpoints(): void {
        $headers = $this->bearer($this->token(MachineAbility::ALL));

        $this->withHeaders($headers)->getJson('/api/users/me')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withHeaders($headers)->getJson('/api/projects')->assertUnauthorized();
    }
    public function test_user_token_cannot_use_machine_endpoints(): void {
        $user = User::factory()->create();
        $user->assignRole('admin');

        $this->withHeaders($this->bearer($user->issueApiToken()))
            ->getJson('/api/flow/machine/me')
            ->assertForbidden();
    }
}
