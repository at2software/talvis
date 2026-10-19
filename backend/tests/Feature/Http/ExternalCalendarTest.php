<?php

namespace Tests\Feature\Http;

use App\Services\SafeUrlGuard;
use GuzzleHttp\Psr7\Response as Psr7Response;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Log;
use Mockery;
use Tests\Support\FakeAuthenticatableUser;
use Tests\TestCase;

class ExternalCalendarTest extends TestCase {
    private const SECRET_URL = 'https://calendar.example.com/private-c2VjcmV0dG9rZW4/basic.ics';

    private function request(array $overrides = []): array {
        return [...['url' => self::SECRET_URL, 'source' => 'Private', 'start' => '2026-10-12', 'end' => '2026-10-19'], ...$overrides];
    }
    private function fakeGuard(callable $send): void {
        $guard = Mockery::mock(SafeUrlGuard::class);
        $guard->shouldReceive('send')->andReturnUsing($send);
        $this->app->instance(SafeUrlGuard::class, $guard);
    }
    public function test_private_targets_are_rejected(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));

        $this->postJson('/api/calendars/occurrences', $this->request(['url' => 'http://127.0.0.1/me.ics']))->assertStatus(422);
    }
    public function test_credentials_require_https(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));

        $this->postJson('/api/calendars/occurrences', $this->request(['url' => 'http://calendar.example.com/me.ics', 'login' => 'me', 'password' => 'secret']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('url');
    }
    public function test_feed_is_expanded_with_basic_auth(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));
        $ics = implode("\r\n", [
            'BEGIN:VCALENDAR', 'VERSION:2.0',
            'BEGIN:VEVENT', 'UID:standup', 'SUMMARY:Standup', 'DTSTART;TZID=Europe/Berlin:20261012T090000', 'DTEND;TZID=Europe/Berlin:20261012T093000', 'RRULE:FREQ=DAILY;COUNT=3', 'END:VEVENT',
            'END:VCALENDAR', '',
        ]);
        $this->fakeGuard(function ($method, $url, $headers) use ($ics) {
            $this->assertSame('Basic '.base64_encode('me:secret'), $headers['Authorization']);
            return new Response(new Psr7Response(200, [], $ics));
        });

        $this->postJson('/api/calendars/occurrences', $this->request(['login' => 'me', 'password' => 'secret']))
            ->assertOk()
            ->assertJsonCount(3, 'events')
            ->assertJsonPath('events.0.title', 'Standup')
            ->assertJsonPath('events.0.source', 'Private')
            ->assertJsonPath('events.1.start', '2026-10-13T09:00:00+02:00');
    }
    public function test_webcal_urls_are_loaded_via_https(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));
        $this->fakeGuard(function ($method, $url) {
            $this->assertSame('https://p01-caldav.icloud.com/published/2/abc', $url);
            return new Response(new Psr7Response(200, [], implode("\r\n", ['BEGIN:VCALENDAR', 'VERSION:2.0', 'END:VCALENDAR', ''])));
        });

        $this->postJson('/api/calendars/occurrences', $this->request(['url' => 'webcal://p01-caldav.icloud.com/published/2/abc']))->assertOk();
    }
    public function test_a_web_page_is_reported_as_such(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));
        $this->fakeGuard(fn () => new Response(new Psr7Response(200, [], '<!DOCTYPE html><html><body>Sign in</body></html>')));

        $this->postJson('/api/calendars/occurrences', $this->request())
            ->assertStatus(422)
            ->assertJsonPath('message', 'The calendar server returned a web page instead of a calendar. Is the calendar public and is this its iCal/ICS link?');
    }
    public function test_feeds_with_bom_and_invalid_lines_are_parsed_leniently(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));
        $ics = "\xEF\xBB\xBF".implode("\r\n", [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'this line is not valid ical',
            'BEGIN:VEVENT', 'UID:family', 'SUMMARY:Family dinner', 'DTSTART;TZID=Europe/Berlin:20261014T180000', 'DTEND;TZID=Europe/Berlin:20261014T200000', 'END:VEVENT',
            'END:VCALENDAR', '',
        ]);
        $this->fakeGuard(fn () => new Response(new Psr7Response(200, [], $ics)));

        $this->postJson('/api/calendars/occurrences', $this->request())
            ->assertOk()
            ->assertJsonPath('events.0.title', 'Family dinner');
    }
    public function test_failures_neither_return_nor_log_the_secret_url(): void {
        $this->actingAs(new FakeAuthenticatableUser(['user']));
        $this->fakeGuard(fn () => throw new ConnectionException('cURL error 28: timeout for '.self::SECRET_URL));
        Log::spy();

        $response = $this->postJson('/api/calendars/occurrences', $this->request())->assertStatus(502);

        $this->assertStringNotContainsString('c2VjcmV0dG9rZW4', $response->getContent());
        Log::shouldHaveReceived('warning')->withArgs(fn ($message, $context) => ! str_contains(json_encode($context), 'c2VjcmV0dG9rZW4') && $context['host'] === 'calendar.example.com');
    }
}
