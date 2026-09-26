<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use App\Traits\HasVaultCredentials;
use Illuminate\Support\Facades\Cache;

class PluginMattermostController extends PluginChatController {
    use HasVaultCredentials;

    public static function getKey(): string {
        return 'mattermost';
    }
    public function vaultPrefix(): string {
        return 'MATTERMOST';
    }
    public function checkCredentials(): bool {
        if (! $this->client) {
            return false;
        }
        return $this->checkResponse(fn () => $this->getToken(true));
    }
    public static function createInstance(): ?static {
        $instance              = new static;
        $instance->credentials = $instance->getCredentials();

        if ($endpoint = $instance->env('ENDPOINT')) {
            $instance->init($endpoint);
            return $instance;
        }
        return null;
    }
    public function __construct(?array $credentials = null) {
        if ($credentials !== null) {
            $this->credentials = $credentials;
            if ($endpoint = $this->env('ENDPOINT')) {
                $this->init($endpoint);
            }
        }
    }
    public static function buildWebhookProps(string $username = 'TALVIS', ?string $icon = null): array {
        $icon = $icon ?? config('app.url').'/icons/project.jpg';
        return [
            'from_webhook'         => 'true',
            'webhook_display_name' => $username,
            'override_username'    => $username,
            'override_icon_url'    => $icon,
        ];
    }
    protected function getPluginLinkUrl($id) {
        return $this->env('ENDPOINT').'projects/'.$id;
    }
    public function getOrCreateChannel($project, string $purpose, string $header, ?string $postfix = null) {
        return $this->getChannelIdFor($project, $postfix) ?? $this->createChannelFor($project, $purpose, $header, $postfix);
    }
    public function getChannelIdFor(Project $project, ?string $postfix = null): ?string {
        $existing = $project->pluginLinks()->where('type', static::getKey())->value('url');
        if ($existing) {
            $parts = explode('/', $existing);
            if (count($parts) > 4) {
                return $parts[count($parts) - 1];   // last element is the channel ID here
            }
        }
        return parent::getChannelIdFor($project, $postfix);
    }
    protected function getToken(bool $forced = false): string {
        $token = Cache::get('api_token');
        if (! $token || $forced) {
            $token = $this->loginAndGetToken();
            Cache::put('api_token', $token, now()->addMinutes(59));
        }
        return $token;
    }
    public function getImageMarkdown(string $path, string $title = 'image'): string {
        return '!['.$title.']('.config('app.api_url').'../'.$path.')';
    }
    public function loginAndGetToken(): string {
        if (! $this->client) {
            return '';
        }
        $response = $this->client->post($this->env('ENDPOINT').'users/login', [
            'json' => [
                'login_id' => $this->env('LOGIN_ID'),
                'password' => $this->env('PASSWORD'),
            ],
        ]);
        return $response->getHeaders()['Token'][0];
    }
    public function getUrl(): string {
        return str_replace('api/v4/', '', $this->env('ENDPOINT'));
    }
    public function getIconFor(Project $project): string {
        return '[:Mattermost:]('.$this->getUrl().($this->env('TEAM_NAME') ?? 'your-team').'/channels/'.$this->getChannelNameFor($project).')';
    }

    // ###### outbound communication
    public function createOrUpdatePost(string $cacheId, string $channelId, string $message, $props = null) {
        return $this->_createOrUpdatePost($cacheId, $channelId, $message, $props, 'id');
    }
    public function createPost(string $channel_id, string $message, $props = null) {
        $payload = ['channel_id' => $channel_id, 'message' => $message];
        if ($props) {
            $payload['props'] = $props;
        } else {
            $payload['props'] = [
                'from_webhook'         => 'true',
                'webhook_display_name' => 'TALVIS',
                'override_username'    => 'TALVIS',
                'override_icon_url'    => config('app.url').'/assets/modules/logo.svg',
            ];
        }
        return $this->post('posts', $payload);
    }
    public function createChannel(string $name, string $display_name, string $purpose, string $header): ?string {
        $payload = [
            'team_id'      => $this->env('TEAM_ID'),
            'name'         => $name,
            'display_name' => $display_name,
            'purpose'      => $purpose,
            'header'       => $header,
            'type'         => 'O',
        ];
        $response = null;
        $data     = $this->post('channels', $payload);
        if ($data && ! empty($data['id'])) {
            $response = $data['id'];
        }
        return $response;
    }
    public function addUsersToChannel(string $channelId, User ...$users) {
        if (! $channelId) {
            return;
        }
        foreach ($users as $user) {
            $this->addUserToChannel($channelId, $user);
        }
    }
    public function addUserToChannel($channelId, User $user) {
        if (! $channelId) {
            return;
        }
        if ($userId = $this->getUserId($user)) {
            $this->post("channels/$channelId/members", ['user_id' => $userId]);
        }
    }
    public function removeUserFromChannel($channelId, User $user) {
        if (! $channelId) {
            return;
        }
        if ($userId = $this->getUserId($user)) {
            $this->delete("channels/$channelId/members/$userId");
        }
    }
    public function getChannelId(string $name): ?string {
        $data = @$this->get('teams/'.$this->env('TEAM_ID').'/channels/name/'.$name);
        if (! empty($data['id'])) {
            if (is_array($data['id'])) {
                return null;
            }
            return $data['id'];
        }
        return null;
    }
    protected function findExistingPost(string $cacheId, string $channelId): ?string {
        $data  = $this->getChannelPosts($channelId, 0, 200);
        $posts = $data['posts'] ?? [];
        foreach ($data['order'] ?? [] as $postId) {
            if (($posts[$postId]['props']['nexus_cache_id'] ?? null) === $cacheId) {
                return $postId;
            }
        }
        return null;
    }
    public function deletePost(string $id): void {
        $this->delete("posts/$id");
    }
    public function getChannelPosts(string $channelId, int $page = 0, int $perPage = 200): array {
        return $this->get("channels/$channelId/posts?page=$page&per_page=$perPage") ?? [];
    }
    public function updatePost(string $id, string $message, $props = null, ?string $channelId = null) {
        $payload = ['id' => $id, 'message' => $message];
        if ($props) {
            $payload['props'] = $props;
        }
        return $this->put('posts/'.$id, $payload);
    }
    public function updateChannel(string $id, $displayName, $purpose, $header) {
        $payload                                 = ['id' => $id];
        $displayName && $payload['display_name'] = $displayName;
        $purpose && $payload['purpose']          = $purpose;
        $header && $payload['header']            = $header;
        return $this->put('channels/'.$id, $payload);
    }
    public function updateStatus(string $status, string $user_id): void {
        $this->put('users/'.$user_id.'/status', ['user_id' => $user_id, 'status' => $status]);
    }
    public function updatePosition(string $position, string $user_id): void {
        $data    = $this->get('users/'.$user_id);
        $payload = [
            'id'       => $data['id'],
            'email'    => $data['email'],
            'username' => $data['username'],
            'position' => $position,
        ];
        $this->put('users/'.$user_id, $payload);
    }
    public function getIdFor(User $user): ?string {
        return $this->getUserId($user);
    }
    public function sendDirectMessageToUserId(string $userId, string $message): void {
        $channelId = $this->getDirectChannelIdFor($userId);
        if ($channelId) {
            $this->createPost($channelId, $message);
        }
    }
    public function getDirectChannelIdFor(string $userId): ?string {
        $me = $this->get('users/me');
        if (! $me || empty($me['id'])) {
            return null;
        }
        $data = $this->post('channels/direct', [$me['id'], $userId]);
        return $data['id'] ?? null;
    }

    // ###### inbound communication
}
