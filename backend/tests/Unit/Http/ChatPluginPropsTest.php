<?php

namespace Tests\Unit\Http;

use App\Http\Controllers\PluginMattermostController;
use App\Http\Controllers\PluginSlackController;
use App\Models\Vault;
use App\Support\ChatProps;
use ReflectionMethod;
use Tests\TestCase;

class ChatPluginPropsTest extends TestCase {
    private function invoke(object $controller, string $method, ...$args): mixed {
        return (new ReflectionMethod($controller, $method))->invoke($controller, ...$args);
    }
    private function props(): array {
        return [
            ...ChatProps::sender('Repo [SAST]', 'https://t/icon.png', 'git_security'),
            'cache_id'    => 'git_security_x_1',
            'attachments' => [ChatProps::attachment('**desc**', 'Jane', '#FFA200')],
        ];
    }
    public function test_mattermost_maps_neutral_props_to_webhook_overrides(): void {
        $props = $this->invoke(new PluginMattermostController, 'toMattermostProps', $this->props());

        $this->assertSame('Repo [SAST]', $props['override_username']);
        $this->assertSame('Repo [SAST]', $props['webhook_display_name']);
        $this->assertSame('https://t/icon.png', $props['override_icon_url']);
        $this->assertSame('git_security', $props['nexus_type']);
        $this->assertSame('git_security_x_1', $props['nexus_cache_id']);
        $this->assertSame('**desc**', $props['attachments'][0]['text']);
    }
    public function test_mattermost_posts_as_talvis_without_props(): void {
        $props = $this->invoke(new PluginMattermostController, 'toMattermostProps', []);

        $this->assertSame('TALVIS', $props['override_username']);
        $this->assertArrayNotHasKey('nexus_cache_id', $props);
    }
    public function test_slack_maps_neutral_props_to_message_payload(): void {
        $payload = $this->invoke(new PluginSlackController([]), 'toSlackMessage', '**hi** [a](https://b)', $this->props());

        $this->assertSame('*hi* <https://b|a>', $payload['text']);
        $this->assertSame('Repo [SAST]', $payload['username']);
        $this->assertSame('https://t/icon.png', $payload['icon_url']);
        $this->assertSame(['event_type' => 'talvis_post', 'event_payload' => ['cache_id' => 'git_security_x_1', 'type' => 'git_security']], $payload['metadata']);
        $this->assertSame('*desc*', $payload['attachments'][0]['text']);
        $this->assertSame('Jane', $payload['attachments'][0]['author_name']);
        $this->assertSame(['text'], $payload['attachments'][0]['mrkdwn_in']);
    }
    public function test_slack_omits_metadata_without_cache_id_or_type(): void {
        $payload = $this->invoke(new PluginSlackController([]), 'toSlackMessage', 'x', []);

        $this->assertArrayNotHasKey('metadata', $payload);
        $this->assertSame('TALVIS', $payload['username']);
    }
    public function test_optional_vault_keys_do_not_count_as_missing(): void {
        $this->assertEqualsCanonicalizing(['SLACK_TOKEN', 'SLACK_TOWN_SQUARE', 'SLACK_USER_TOKEN'], Vault::getVaultKeys('SLACK')->all());
        $this->assertEqualsCanonicalizing(['SLACK_TOKEN', 'SLACK_TOWN_SQUARE'], Vault::getRequiredVaultKeys('SLACK')->all());
        $this->assertEquals(Vault::getVaultKeys('GITLAB'), Vault::getRequiredVaultKeys('GITLAB'));
    }
}
