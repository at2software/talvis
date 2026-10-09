<?php

namespace Tests\Feature\Http;

use App\Enums\VacationState;
use App\Models\Param;
use App\Models\User;
use App\Models\Vacation;
use App\Models\VacationGrant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\Group;
use ReflectionProperty;
use Tests\TestCase;

#[Group('database')]
class CalendarFeedTest extends TestCase {
    use DatabaseTransactions;

    protected function setUp(): void {
        parent::setUp();
        (new ReflectionProperty(Param::class, 'paramCache'))->setValue(null, []);
    }
    private function feedPath(User $user): string {
        $this->actingAs($user);
        $url = $this->getJson('/api/calendar-feed')->assertOk()->json('url');
        $this->app['auth']->forgetGuards();
        return '/api/caldav/feed/'.basename($url);
    }
    public function test_feed_is_reachable_by_token_and_lists_approved_vacations_as_all_day_events(): void {
        $user  = User::factory()->create();
        $grant = VacationGrant::factory()->create(['user_id' => $user->id]);
        Vacation::factory()->create(['vacation_grant_id' => $grant->id, 'state' => VacationState::Approved, 'amount' => -24, 'started_at' => '2026-12-21', 'ended_at' => '2026-12-23']);

        $response = $this->get($this->feedPath($user));

        $response->assertOk();
        $this->assertStringStartsWith('text/calendar', $response->headers->get('Content-Type'));
        $ics = $response->getContent();
        $this->assertStringContainsString('BEGIN:VCALENDAR', $ics);
        $this->assertStringContainsString("DTSTART;VALUE=DATE:20261221\r\nDTEND;VALUE=DATE:20261224", $ics);
        $this->assertStringContainsString('SUMMARY:Vacation of '.$user->name, $ics);
    }
    public function test_rotating_invalidates_the_old_url(): void {
        $user = User::factory()->create();
        $old  = $this->feedPath($user);

        $this->actingAs($user);
        $new = '/api/caldav/feed/'.basename($this->postJson('/api/calendar-feed')->assertOk()->json('url'));
        $this->app['auth']->forgetGuards();

        $this->get($old)->assertNotFound();
        $this->get($new)->assertOk();
    }
    public function test_unknown_tokens_are_rejected(): void {
        $this->get('/api/caldav/feed/'.str_repeat('a', 48).'.ics')->assertNotFound();
    }
}
