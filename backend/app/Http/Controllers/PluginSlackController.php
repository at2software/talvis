<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use App\Support\SlackMrkdwn;
use App\Traits\HasVaultCredentials;
use Illuminate\Support\Facades\Cache;

class PluginSlackController extends PluginChatController {
    use HasVaultCredentials;

    private const API             = 'https://slack.com/api/';
    private const METADATA_EVENT  = 'talvis_post';
    private const STATUS_PROFILES = [
        'online'  => ['status_text' => '', 'status_emoji' => ''],
        'away'    => ['status_text' => 'Away', 'status_emoji' => ':clock3:'],
        'dnd'     => ['status_text' => 'Do not disturb', 'status_emoji' => ':no_entry:'],
        'offline' => ['status_text' => 'Offline', 'status_emoji' => ':zzz:'],
    ];

    public static function getKey(): string {
        return 'slack';
    }
    public function vaultPrefix(): string {
        return 'SLACK';
    }
    public static function createInstance(): ?static {
        $instance              = new static;
        $instance->credentials = $instance->getCredentials();
        if (! $instance->env('TOKEN')) {
            return null;
        }
        $instance->init(self::API);
        return $instance;
    }
    public function __construct(?array $credentials = null) {
        if ($credentials !== null) {
            $this->credentials = $credentials;
            $this->init(self::API);
        }
    }
    public function checkCredentials(): bool {
        return $this->checkResponse(fn () => $this->workspace(true));
    }
    protected function getToken(): string {
        return $this->env('TOKEN') ?? '';
    }

    // ###### Slack Web API transport

    private function call(string $method, array $payload = []): ?array {
        $data = $this->post($method, $payload);
        return ($data['ok'] ?? false) ? $data : null;
    }
    private function read(string $method, array $query = []): ?array {
        $data = $this->curl('get', $method, ['query' => $query]);
        return ($data['ok'] ?? false) ? $data : null;
    }
    private function callAsAdmin(string $method, array $payload): ?array {
        $token = $this->env('USER_TOKEN');
        if (! $token || ! $this->client) {
            return null;
        }
        try {
            $response = $this->client->post(self::API.$method, [
                'headers' => ['Content-Type' => 'application/json; charset=utf-8', 'Authorization' => 'Bearer '.$token],
                'json'    => $payload,
            ]);
            $data = json_decode($response->getBody(), true);
            return ($data['ok'] ?? false) ? $data : null;
        } catch (\Exception $e) {
            return null;
        }
    }
    private function workspace(bool $forced = false): ?array {
        $key = 'slack_auth_'.hash('sha256', $this->getToken());
        if ($forced) {
            Cache::forget($key);
        }
        $data = Cache::get($key) ?? $this->call('auth.test');
        if ($data) {
            Cache::put($key, $data, now()->addDay());
        }
        return $data;
    }

    // ###### users

    public function getUserId(User $user): ?string {
        $linked = parent::getUserId($user);
        if ($linked || ! $user->email) {
            return $linked;
        }
        return Cache::remember('slack_user_'.hash('sha256', $user->email), now()->addDay(), fn () => $this->read('users.lookupByEmail', ['email' => $user->email])['user']['id'] ?? null);
    }
    public function getIdFor(User $user): ?string {
        return $this->getUserId($user);
    }
    public function updateStatus(string $status, string $userId): void {
        if ($profile = self::STATUS_PROFILES[$status] ?? null) {
            $this->callAsAdmin('users.profile.set', ['user' => $userId, 'profile' => [...$profile, 'status_expiration' => 0]]);
        }
    }
    public function updatePosition(string $position, string $userId): void {
        $this->callAsAdmin('users.profile.set', ['user' => $userId, 'profile' => ['title' => $position]]);
    }

    // ###### outbound communication

    public function createOrUpdatePost(string $cacheId, string $channelId, string $message, $props = null) {
        return $this->_createOrUpdatePost($cacheId, $channelId, $message, $props, 'ts');
    }
    public function createPost(string $channelId, string $message, $props = null) {
        return $this->call('chat.postMessage', ['channel' => $channelId, ...$this->toSlackMessage($message, $props ?? [])]);
    }
    public function updatePost(string $id, string $message, $props = null, ?string $channelId = null) {
        if (! $channelId) {
            return null;
        }
        return $this->call('chat.update', ['channel' => $channelId, 'ts' => $id, ...$this->toSlackMessage($message, $props ?? [])]);
    }
    private function toSlackMessage(string $message, array $props): array {
        $payload = [
            'text'         => SlackMrkdwn::from($message),
            'unfurl_links' => false,
            'unfurl_media' => true,
            'username'     => $props['username'] ?? 'TALVIS',
            'icon_url'     => $props['icon_url'] ?? config('app.url').'/icons/project.jpg',
        ];
        if (! empty($props['attachments'])) {
            $payload['attachments'] = array_map(fn (array $attachment) => [
                ...$attachment,
                'text'      => SlackMrkdwn::from($attachment['text'] ?? ''),
                'mrkdwn_in' => ['text'],
            ], $props['attachments']);
        }
        $metadata = array_filter(['cache_id' => $props['cache_id'] ?? null, 'type' => $props['type'] ?? null]);
        if ($metadata) {
            $payload['metadata'] = ['event_type' => self::METADATA_EVENT, 'event_payload' => $metadata];
        }
        return $payload;
    }
    protected function findExistingPost(string $cacheId, string $channelId): ?string {
        $data = $this->getChannelPosts($channelId);
        foreach ($data['order'] ?? [] as $ts) {
            if (($data['posts'][$ts]['metadata']['event_payload']['cache_id'] ?? null) === $cacheId) {
                return $ts;
            }
        }
        return null;
    }
    public function getChannelPosts(string $channelId, int $page = 0, int $perPage = 200): array {
        $cursor = null;
        for ($i = 0; $i <= $page; $i++) {
            $data   = $this->read('conversations.history', array_filter(['channel' => $channelId, 'limit' => $perPage, 'include_all_metadata' => 'true', 'cursor' => $cursor]));
            $cursor = $data['response_metadata']['next_cursor'] ?? null;
            if (! $data || ($i < $page && ! $cursor)) {
                return [];
            }
        }
        $messages = collect($data['messages'] ?? []);
        return [
            'posts' => $messages->keyBy('ts')->all(),
            'order' => $messages->pluck('ts')->all(),
        ];
    }
    public function getDirectChannelIdFor(string $userId): ?string {
        return $this->call('conversations.open', ['users' => $userId])['channel']['id'] ?? null;
    }
    public function sendDirectMessageToUserId(string $userId, string $message): void {
        if ($channelId = $this->getDirectChannelIdFor($userId)) {
            $this->createPost($channelId, $message);
        }
    }

    // ###### channels

    public function createChannel(string $name, string $display_name, string $purpose, string $header): ?string {
        $name      = substr(strtolower($name), 0, 80);
        $channelId = $this->call('conversations.create', ['name' => $name, 'is_private' => false])['channel']['id'] ?? $this->getChannelId($name);
        if ($channelId) {
            $this->updateChannel($channelId, null, $purpose, $header);
        }
        return $channelId;
    }
    public function updateChannel(string $id, $displayName, $purpose, $header) {
        if ($displayName) {
            $this->call('conversations.rename', ['channel' => $id, 'name' => substr(strtolower($displayName), 0, 80)]);
        }
        if ($purpose) {
            $this->call('conversations.setPurpose', ['channel' => $id, 'purpose' => $purpose]);
        }
        if ($header) {
            $this->call('conversations.setTopic', ['channel' => $id, 'topic' => $header]);
        }
    }
    public function getChannelId(string $name): ?string {
        $cursor = null;
        do {
            $data = $this->read('conversations.list', array_filter([
                'types'            => 'public_channel,private_channel',
                'exclude_archived' => 'true',
                'limit'            => 1000,
                'cursor'           => $cursor,
            ]));
            foreach ($data['channels'] ?? [] as $channel) {
                if ($channel['name'] === $name) {
                    return $channel['id'];
                }
            }
            $cursor = $data['response_metadata']['next_cursor'] ?? null;
        } while ($cursor);
        return null;
    }
    public function addUsersToChannel(string $channelId, User ...$users) {
        $userIds = array_values(array_filter(array_map(fn (User $user) => $this->getUserId($user), $users)));
        if (! $channelId || ! $userIds) {
            return null;
        }
        return $this->call('conversations.invite', ['channel' => $channelId, 'users' => implode(',', $userIds), 'force' => true]);
    }
    public function removeUserFromChannel($channelId, User $user) {
        if ($channelId && $userId = $this->getUserId($user)) {
            return $this->call('conversations.kick', ['channel' => $channelId, 'user' => $userId]);
        }
        return null;
    }

    // ###### plugin-specific abstractions

    public function getImageMarkdown(string $path, string $title = 'image'): string {
        return '!['.$title.']('.config('app.api_url').'../'.$path.")\n";
    }
    public function getIconFor(Project $project): string {
        $workspaceUrl = $this->workspace()['url'] ?? null;
        $channelId    = $this->getChannelIdFor($project);
        return $workspaceUrl && $channelId ? '[:slack:]('.$workspaceUrl.'archives/'.$channelId.')' : '';
    }
}
