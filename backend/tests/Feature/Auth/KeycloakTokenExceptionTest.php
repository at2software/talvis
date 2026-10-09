<?php

namespace Tests\Feature\Auth;

use Illuminate\Support\Facades\Route;
use KeycloakGuard\Exceptions\TokenException;
use Tests\TestCase;

class KeycloakTokenExceptionTest extends TestCase {
    public function test_an_invalid_keycloak_token_answers_401_instead_of_500(): void {
        Route::get('/api/test-keycloak-token', fn () => throw new TokenException('[Keycloak Guard] Wrong number of segments'));

        $this->getJson('/api/test-keycloak-token')
            ->assertUnauthorized()
            ->assertExactJson(['message' => 'Unauthenticated.']);
    }
}
