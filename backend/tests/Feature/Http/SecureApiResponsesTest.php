<?php

namespace Tests\Feature\Http;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class SecureApiResponsesTest extends TestCase {
    public function test_api_errors_render_as_json_even_when_html_is_requested(): void {
        $this->get('/api/does-not-exist', ['Accept' => 'text/html'])
            ->assertNotFound()
            ->assertHeader('Content-Type', 'application/json')
            ->assertJsonStructure(['message']);
    }
    public function test_json_responses_get_strict_security_headers(): void {
        $this->get('/api/sysinfo')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeaderMissing('Strict-Transport-Security');
    }
    public function test_hsts_is_only_sent_over_https(): void {
        $this->get('https://localhost/api/sysinfo')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    public function test_documents_may_be_framed_by_the_frontend(): void {
        config(['cors.allowed_origins' => ['https://talvis.test', '*']]);
        Route::get('api/_test/pdf', fn () => response('%PDF-1.7', 200, ['Content-Type' => 'application/pdf']));

        $this->get('/api/_test/pdf')
            ->assertHeader('Content-Security-Policy', "frame-ancestors 'self' https://talvis.test")
            ->assertHeader('X-Frame-Options', 'SAMEORIGIN')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }
    public function test_neuron_icon_is_served_as_png_with_security_headers(): void {
        $this->get('https://localhost/api/neuron/icon')
            ->assertOk()
            ->assertHeader('Content-Type', 'image/png')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'SAMEORIGIN')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    public function test_headers_set_by_the_endpoint_are_kept(): void {
        Route::get('api/_test/framed', fn () => response()->json([])->header('X-Frame-Options', 'SAMEORIGIN'));

        $this->get('/api/_test/framed')->assertHeader('X-Frame-Options', 'SAMEORIGIN');
    }
    public function test_dav_requests_keep_their_accept_header(): void {
        $response = $this->call('PROPFIND', '/api/carddav', server: ['HTTP_ACCEPT' => 'application/xml']);

        $response->assertUnauthorized();
        $this->assertStringNotContainsString('json', (string)$response->headers->get('Content-Type'));
    }
    public function test_non_api_routes_are_untouched(): void {
        $this->get('/')->assertHeaderMissing('X-Frame-Options');
    }
}
