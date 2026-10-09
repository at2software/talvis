<?php

namespace Tests\Feature\Http;

use App\Http\Controllers\PluginTeamsController;
use App\Models\Param;
use App\Models\User;
use App\Models\Vault;
use App\Support\ChatProps;
use App\Support\TeamsMarkdown;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\Group;
use ReflectionProperty;
use Tests\TestCase;

#[Group('database')]
class TeamsChatTest extends TestCase {
    use DatabaseTransactions;

    private const CHANNEL = '19:abc@thread.tacv2';

    protected function setUp(): void {
        parent::setUp();
        (new ReflectionProperty(Param::class, 'paramCache'))->setValue(null, []);
        Cache::flush();
        foreach (['TENANT_ID' => 'tenant', 'CLIENT_ID' => 'app-id', 'CLIENT_SECRET' => 'secret', 'TEAM_ID' => 'team-1'] as $key => $value) {
            Vault::updateOrCreate(['key' => 'M365_'.$key], ['value' => $value]);
        }
        Http::fake([
            'login.microsoftonline.com/*'                       => Http::response(['access_token' => 'token']),
            'smba.trafficmanager.net/teams/v3/conversations'    => Http::response(['id' => 'conv-1', 'activityId' => 'act-1']),
            'smba.trafficmanager.net/teams/v3/conversations/*'  => Http::response(['id' => 'act-2']),
            'graph.microsoft.com/v1.0/teams/team-1/channels*'   => Http::response(['value' => [['id' => self::CHANNEL, 'displayName' => 'Shop', 'description' => "Kickoff\n[nexus_project_7]"]]]),
            'graph.microsoft.com/v1.0/users/*/presence/*'       => Http::response([], 200),
            'graph.microsoft.com/v1.0/users/*'                  => Http::response(['id' => 'aad-1']),
        ]);
    }
    public function test_teams_is_active_once_a_team_is_configured(): void {
        $this->assertInstanceOf(PluginTeamsController::class, PluginTeamsController::createInstance());

        Vault::where('key', 'M365_TEAM_ID')->delete();
        $this->assertNull(PluginTeamsController::createInstance());
    }
    public function test_channel_posts_start_a_thread_and_can_be_updated(): void {
        $teams = PluginTeamsController::createInstance();

        $post = $teams->createPost(self::CHANNEL, '#### Done', ChatProps::sender('Shop'));
        $teams->updatePost($post['id'], 'changed');

        $this->assertSame('conv-1|act-1', $post['id']);
        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), 'v3/conversations')
            && $request['channelData']['channel']['id'] === self::CHANNEL
            && $request['activity']['text'] === "**Shop**\n\n**Done**");
        Http::assertSent(fn (Request $request) => $request->method() === 'PUT' && str_ends_with($request->url(), 'conversations/conv-1/activities/act-1'));
    }
    public function test_channels_are_found_by_their_technical_name(): void {
        $this->assertSame(self::CHANNEL, PluginTeamsController::createInstance()->getChannelId('nexus_project_7'));
    }
    public function test_vacation_status_sets_the_preferred_presence(): void {
        PluginTeamsController::createInstance()->updateStatus('dnd', 'aad-1');

        Http::assertSent(fn (Request $request) => str_ends_with($request->url(), 'users/aad-1/presence/setUserPreferredPresence') && $request['availability'] === 'DoNotDisturb');
    }
    public function test_inbound_activities_need_a_bot_framework_token(): void {
        $this->postJson('/api/teams/messages', ['type' => 'message', 'serviceUrl' => 'https://smba.trafficmanager.net/emea/'])->assertUnauthorized();
        $this->assertNotSame('https://smba.trafficmanager.net/emea/', Param::get('TEAMS_SERVICE_URL')->value);
    }
    public function test_admins_download_the_teams_app_package_with_the_configured_app_id(): void {
        $admin = User::factory()->create();
        $admin->assignRole('admin');

        $response = $this->actingAs($admin)->get('/api/vaults/m365/teams-app-package')->assertOk();

        $zip = new \ZipArchive;
        $zip->open($response->baseResponse->getFile()->getPathname());
        $manifest = json_decode($zip->getFromName('manifest.json'), true);
        $this->assertSame('app-id', $manifest['id']);
        $this->assertSame('app-id', $manifest['bots'][0]['botId']);
        $this->assertNotFalse($zip->locateName('color.png'));
    }
    public function test_markdown_is_reduced_to_what_teams_renders(): void {
        $this->assertSame("**Features:**\n\n- ☐ Login\n\n[gestartet](https://t/p.png)", TeamsMarkdown::from("#### Features:\n* [ ] Login\n![gestartet](https://t/p.png)"));
        $this->assertSame('[success `x`](U)', TeamsMarkdown::from('[![x](https://i/b.png =16x16 "success") `x`](U)'));
    }
    public function test_users_are_mapped_by_their_admin_linked_account(): void {
        $user = User::factory()->create(['email' => 'jane@at2-software.com']);
        $this->assertNull(PluginTeamsController::createInstance()->getUserId($user));

        $user->forceFill(['m365_object_id' => 'aad-1'])->save();
        $this->assertSame('aad-1', PluginTeamsController::createInstance()->getUserId($user));
    }
}
