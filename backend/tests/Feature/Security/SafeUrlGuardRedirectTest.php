<?php

namespace Tests\Feature\Security;

use App\Services\SafeUrlGuard;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Mockery;
use Tests\TestCase;

class SafeUrlGuardRedirectTest extends TestCase {
    private function guard(): SafeUrlGuard {
        $guard = Mockery::mock(SafeUrlGuard::class)->makePartial();
        $guard->shouldReceive('pinnedCurlOptions')->andReturn([]);
        return $guard;
    }
    public function test_credentials_are_dropped_on_redirect_to_another_host(): void {
        Http::fake([
            'https://calendar.example.com/*'  => Http::response('', 302, ['Location' => 'https://elsewhere.example.org/feed.ics']),
            'https://elsewhere.example.org/*' => Http::response('BEGIN:VCALENDAR'),
        ]);

        $this->guard()->send('GET', 'https://calendar.example.com/me.ics', ['Authorization' => 'Basic c2VjcmV0', 'Accept' => 'text/calendar']);

        Http::assertSent(fn (Request $request) => $request->url() === 'https://elsewhere.example.org/feed.ics' && ! $request->hasHeader('Authorization') && $request->hasHeader('Accept'));
    }
    public function test_credentials_are_kept_on_redirect_within_the_same_origin(): void {
        Http::fake([
            'https://calendar.example.com/me.ics' => Http::response('', 301, ['Location' => '/v2/me.ics']),
            'https://calendar.example.com/v2/*'   => Http::response('BEGIN:VCALENDAR'),
        ]);

        $this->guard()->send('GET', 'https://calendar.example.com/me.ics', ['Authorization' => 'Basic c2VjcmV0']);

        Http::assertSent(fn (Request $request) => $request->url() === 'https://calendar.example.com/v2/me.ics' && $request->hasHeader('Authorization'));
    }
    public function test_redirects_from_https_to_http_are_refused(): void {
        Http::fake(['https://calendar.example.com/*' => Http::response('', 302, ['Location' => 'http://calendar.example.com/me.ics'])]);

        $this->expectException(ConnectionException::class);
        $this->guard()->send('GET', 'https://calendar.example.com/me.ics', ['Authorization' => 'Basic c2VjcmV0']);
    }
}
