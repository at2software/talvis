<?php

namespace Tests\Feature\Http;

use App\Actions\User\MirrorToMicrosoft365Action;
use App\Enums\VacationState;
use App\Models\M365MirrorItem;
use App\Models\Param;
use App\Models\User;
use App\Models\Vacation;
use App\Models\VacationGrant;
use App\Models\Vault;
use App\Services\MicrosoftGraph;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\Group;
use ReflectionProperty;
use Tests\TestCase;

#[Group('database')]
class Microsoft365SyncTest extends TestCase {
    use DatabaseTransactions;

    private User $user;
    private int $created         = 0;
    private array $idTokenClaims = [];

    protected function setUp(): void {
        parent::setUp();
        (new ReflectionProperty(Param::class, 'paramCache'))->setValue(null, []);
        Cache::flush();
        foreach (['TENANT_ID' => 'tenant', 'CLIENT_ID' => 'client', 'CLIENT_SECRET' => 'secret'] as $key => $value) {
            Vault::updateOrCreate(['key' => 'M365_'.$key], ['value' => $value]);
        }
        Http::fake(function (Request $request) {
            $path = parse_url($request->url(), PHP_URL_PATH);
            return match (true) {
                str_ends_with($request->url(), 'oauth2/v2.0/token')                          => Http::response(['access_token' => 'token', 'id_token' => $this->idToken($this->idTokenClaims)]),
                str_contains($request->url(), 'login.microsoftonline.com')                   => Http::response(['access_token' => 'token']),
                $request->method() === 'GET' && str_ends_with($path, '/calendars')           => Http::response(['value' => []]),
                $request->method() === 'GET' && str_ends_with($path, '/contactFolders')      => Http::response(['value' => []]),
                $request->method() === 'POST' && str_ends_with($path, '/calendars')          => Http::response(['id' => 'cal-1'], 201),
                $request->method() === 'POST' && str_ends_with($path, '/contactFolders')     => Http::response(['id' => 'folder-1'], 201),
                $request->method() === 'POST'                                                => Http::response(['id' => 'item-'.++$this->created], 201),
                default                                                                      => Http::response(['id' => 'patched'], 200),
            };
        });
        $this->user = User::factory()->create(['email' => 'jane.doe@at2-software.com']);
        $this->user->forceFill(['m365_object_id' => 'aad-jane', 'm365_address' => 'jane@at2-software.com'])->save();
        $this->toggle('M365_AUTOREPLY', '1');
    }
    private function toggle(string $key, string $value): void {
        $param        = $this->user->param($key);
        $param->value = $value;
        $param->save();
    }
    private function vacation(array $attributes = []): Vacation {
        $grant = VacationGrant::factory()->create(['user_id' => $this->user->id]);
        return Vacation::factory()->create(['vacation_grant_id' => $grant->id, 'state' => VacationState::Approved, 'amount' => -16, 'started_at' => '2026-12-21', 'ended_at' => '2026-12-22', ...$attributes]);
    }
    private function mirror(string $kind): array {
        return app(MirrorToMicrosoft365Action::class)->execute($this->user->fresh(), $kind, MicrosoftGraph::fromVault());
    }
    public function test_calendar_mirror_creates_a_talvis_calendar_with_free_events(): void {
        $this->toggle('M365_SYNC_CALENDAR', '1');
        $vacation = $this->vacation();

        $stats = $this->mirror(MicrosoftGraph::CALENDAR);

        $this->assertGreaterThan(0, $stats['created']);
        $this->assertSame('cal-1', $this->user->fresh()->param('M365_CALENDAR_ID')->value);
        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && str_ends_with($request->url(), 'users/aad-jane/calendars/cal-1/events')
            && $request['subject'] === 'Vacation of '.$this->user->name
            && $request['isAllDay'] === true
            && $request['showAs'] === 'free'
            && $request['start']['dateTime'] === '2026-12-21T00:00:00'
            && $request['end']['dateTime'] === '2026-12-23T00:00:00');
        $this->assertTrue(M365MirrorItem::where('user_id', $this->user->id)->where('source_id', 'vacation_'.$vacation->id)->exists());
    }
    public function test_unchanged_items_are_not_sent_again_and_removed_ones_are_deleted(): void {
        $this->toggle('M365_SYNC_CALENDAR', '1');
        $vacation = $this->vacation();
        $this->mirror(MicrosoftGraph::CALENDAR);
        $itemId = M365MirrorItem::where('source_id', 'vacation_'.$vacation->id)->value('external_id');

        $vacation->delete();
        $stats = $this->mirror(MicrosoftGraph::CALENDAR);

        $this->assertSame(['created' => 0, 'updated' => 0, 'deleted' => 1, 'failed' => 0], $stats);
        Http::assertSent(fn (Request $request) => $request->method() === 'DELETE' && str_ends_with($request->url(), 'events/'.$itemId));
    }
    public function test_switching_the_mirror_off_removes_the_folder(): void {
        $this->toggle('M365_SYNC_CONTACTS', '1');
        $this->mirror(MicrosoftGraph::CONTACTS);
        $this->toggle('M365_SYNC_CONTACTS', '');

        $this->mirror(MicrosoftGraph::CONTACTS);

        Http::assertSent(fn (Request $request) => $request->method() === 'DELETE' && str_ends_with($request->url(), 'contactFolders/folder-1'));
        $this->assertSame('', (string)$this->user->fresh()->param('M365_CONTACT_FOLDER_ID')->value);
        $this->assertSame(0, M365MirrorItem::where('user_id', $this->user->id)->where('kind', 'contacts')->count());
    }
    public function test_users_without_mirror_toggles_are_left_alone(): void {
        $this->vacation();

        $this->assertSame(['created' => 0, 'updated' => 0, 'deleted' => 0, 'failed' => 0], $this->mirror(MicrosoftGraph::CALENDAR));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'graph.microsoft.com'));
    }
    public function test_without_an_admin_linked_account_nothing_is_mirrored(): void {
        $this->user->forceFill(['m365_object_id' => null])->save();
        $this->toggle('M365_SYNC_CALENDAR', '1');

        $this->assertSame(['created' => 0, 'updated' => 0, 'deleted' => 0, 'failed' => 0], $this->mirror(MicrosoftGraph::CALENDAR));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'graph.microsoft.com'));
    }
    private function idToken(array $claims): string {
        $encode = fn (array $part) => rtrim(strtr(base64_encode(json_encode($part)), '+/', '-_'), '=');
        return $encode(['alg' => 'RS256']).'.'.$encode([...['tid' => 'tenant', 'aud' => 'client', 'oid' => 'aad-new', 'preferred_username' => 'jane@at2-software.com'], ...$claims]).'.sig';
    }
    private function returnFromMicrosoft(array $claims = [], ?string $state = null): TestResponse {
        $this->idTokenClaims = $claims;
        $state ??= Crypt::encrypt(['user' => $this->user->id, 'expires' => now()->addMinutes(5)->timestamp, 'nonce' => 'n']);
        return $this->get('/api/microsoft365/callback?'.http_build_query(['code' => 'auth-code', 'state' => $state]));
    }
    public function test_connecting_starts_a_microsoft_sign_in_for_the_own_account(): void {
        $url = $this->actingAs($this->user)->getJson('/api/microsoft365/connect')->assertOk()->json('url');

        $this->assertStringStartsWith('https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?', $url);
        parse_str(parse_url($url, PHP_URL_QUERY), $query);
        $this->assertSame('client', $query['client_id']);
        $this->assertSame('openid profile', $query['scope']);
        $this->assertSame($this->user->id, Crypt::decrypt($query['state'])['user']);
    }
    public function test_the_callback_links_the_account_microsoft_confirmed_and_cleans_up_the_old_one(): void {
        $this->toggle('M365_SYNC_CONTACTS', '1');
        $this->mirror(MicrosoftGraph::CONTACTS);

        $this->returnFromMicrosoft()->assertRedirectContains('/profile/vcard?m365=connected');

        $this->assertSame('aad-new', $this->user->fresh()->m365_object_id);
        $this->assertSame('jane@at2-software.com', $this->user->fresh()->m365_address);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), 'oauth2/v2.0/token') && ($request->data()['code'] ?? null) === 'auth-code' && ($request->data()['grant_type'] ?? null) === 'authorization_code');
        Http::assertSent(fn (Request $request) => $request->method() === 'DELETE' && str_ends_with($request->url(), 'users/aad-jane/contactFolders/folder-1'));
    }
    public function test_accounts_of_another_tenant_or_app_are_rejected(): void {
        $this->returnFromMicrosoft(['tid' => 'other-tenant'])->assertRedirectContains('m365=error');
        $this->returnFromMicrosoft(['aud' => 'other-app'])->assertRedirectContains('m365=error');

        $this->assertSame('aad-jane', $this->user->fresh()->m365_object_id);
    }
    public function test_tampered_or_expired_state_is_rejected(): void {
        $this->returnFromMicrosoft(state: 'forged')->assertRedirectContains('m365=error');
        $this->returnFromMicrosoft(state: Crypt::encrypt(['user' => $this->user->id, 'expires' => now()->subMinute()->timestamp]))->assertRedirectContains('m365=error');

        $this->assertSame('aad-jane', $this->user->fresh()->m365_object_id);
    }
    public function test_users_cannot_set_the_account_themselves_or_disconnect_others(): void {
        $other = User::factory()->create();
        $this->actingAs($other);

        $this->putJson("/api/users/{$other->id}", ['m365_object_id' => 'aad-jane']);
        $this->deleteJson("/api/users/{$this->user->id}/microsoft365")->assertForbidden();

        $this->assertNull($other->fresh()->m365_object_id);
        $this->assertSame('aad-jane', $this->user->fresh()->m365_object_id);
    }
    public function test_users_disconnect_themselves(): void {
        $this->actingAs($this->user)->deleteJson("/api/users/{$this->user->id}/microsoft365")->assertOk();

        $this->assertNull($this->user->fresh()->m365_object_id);
    }
    public function test_automatic_reply_is_scheduled_once_for_the_next_vacation(): void {
        $vacation = $this->vacation(['started_at' => today()->addDays(3)->toDateString(), 'ended_at' => today()->addDays(5)->toDateString()]);

        $this->artisan('cron:m365-automatic-replies')->assertSuccessful();
        $this->artisan('cron:m365-automatic-replies')->assertSuccessful();

        $patches = Http::recorded(fn (Request $request) => str_ends_with($request->url(), 'mailboxSettings'));
        $this->assertCount(1, $patches);
        $setting = $patches->first()[0]['automaticRepliesSetting'];
        $this->assertSame('scheduled', $setting['status']);
        $this->assertSame(today()->addDays(6)->format('Y-m-d').'T00:00:00', $setting['scheduledEndDateTime']['dateTime']);
        $this->assertStringContainsString(today()->addDays(5)->format('d.m.Y'), $setting['externalReplyMessage']);
        $this->assertStringStartsWith($vacation->id.':', $this->user->param('M365_AUTOREPLY_VACATION_ID')->value);
    }
    public function test_a_personal_text_overrides_the_default_and_reschedules_when_changed(): void {
        $this->vacation(['started_at' => today()->addDays(3)->toDateString(), 'ended_at' => today()->addDays(5)->toDateString()]);
        $this->artisan('cron:m365-automatic-replies')->assertSuccessful();

        $this->toggle('M365_AUTOREPLY_TEXT', 'Bin weg bis {until}. {name}');
        $this->artisan('cron:m365-automatic-replies')->assertSuccessful();

        $patches = Http::recorded(fn (Request $request) => str_ends_with($request->url(), 'mailboxSettings'))->values();
        $this->assertCount(2, $patches);
        $this->assertSame('Bin weg bis '.today()->addDays(5)->format('d.m.Y').'. '.$this->user->name, $patches[1][0]['automaticRepliesSetting']['internalReplyMessage']);
    }
    public function test_automatic_reply_needs_its_own_switch(): void {
        $this->toggle('M365_AUTOREPLY', '');
        $this->vacation(['started_at' => today()->addDays(3)->toDateString(), 'ended_at' => today()->addDays(5)->toDateString()]);

        $this->artisan('cron:m365-automatic-replies')->assertSuccessful();

        Http::assertNotSent(fn (Request $request) => str_ends_with($request->url(), 'mailboxSettings'));
    }
}
