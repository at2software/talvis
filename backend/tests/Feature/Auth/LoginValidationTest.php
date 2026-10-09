<?php

namespace Tests\Feature\Auth;

use Tests\TestCase;

class LoginValidationTest extends TestCase {
    public function test_login_rejects_missing_email(): void {
        $this->postJson('/api/login', [])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Login not set');
    }
    public function test_login_rejects_missing_password(): void {
        $this->postJson('/api/login', [
            'email' => 'person@example.com',
        ])
            ->assertStatus(403)
            ->assertJsonPath('message', 'Password not set');
    }
}
