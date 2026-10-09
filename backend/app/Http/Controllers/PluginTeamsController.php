<?php

namespace App\Http\Controllers;

use App\Models\Project;
use App\Models\User;
use App\Models\Vault;
use App\Services\MicrosoftGraph;
use App\Services\TeamsBot;
use App\Support\TeamsMarkdown;
use App\Traits\HasVaultCredentials;
use Illuminate\Support\Str;

class PluginTeamsController extends PluginChatController {
    use HasVaultCredentials;

    private const CHANNEL_PREFIX     = '19:';
    private const NAME_MAX_LENGTH    = 50;
    private const PRESENCE_BY_STATUS = [
        'online'  => null,
        'away'    => 'Away',
        'dnd'     => 'DoNotDisturb',
        'offline' => 'Offline',
    ];

    private MicrosoftGraph $graph;
    private TeamsBot $bot;

    public static function getKey(): string {
        return 'teams';
    }
    public function vaultPrefix(): string {
        return MicrosoftGraph::VAULT;
    }
    public static function createInstance(): ?static {
        $graph = MicrosoftGraph::fromVault();
        if (! $graph || ! $graph->credentialValue('TEAM_ID')) {
            return null;
        }
        $instance              = new static;
        $instance->credentials = Vault::getCredentials(MicrosoftGraph::VAULT);
        $instance->graph       = $graph;
        $instance->bot         = new TeamsBot($graph);
        return $instance;
    }
    public function checkCredentials(): bool {
        return $this->graph->canReadUsers();
    }
    protected function getToken(): string {
        return '';
    }
    private function teamId(): string {
        return (string)$this->env('TEAM_ID');
    }

    // ###### users

    public function getUserId(User $user): ?string {
        return parent::getUserId($user) ?? $user->microsoft365Mailbox();
    }
    public function getIdFor(User $user): ?string {
        return $this->getUserId($user);
    }
    public function updateStatus(string $status, string $userId): void {
        if (array_key_exists($status, self::PRESENCE_BY_STATUS)) {
            $this->graph->setPreferredPresence($userId, self::PRESENCE_BY_STATUS[$status]);
        }
    }
    public function updatePosition(string $position, string $userId): void {}

    // ###### outbound communication

    public function createOrUpdatePost(string $cacheId, string $channelId, string $message, $props = null) {
        return $this->_createOrUpdatePost($cacheId, $channelId, $message, $props, 'id');
    }
    public function createPost(string $channelId, string $message, $props = null) {
        $text = $this->toTeamsMessage($message, $props ?? []);
        if (str_starts_with($channelId, self::CHANNEL_PREFIX)) {
            $thread = $this->bot->startChannelThread($channelId, $text);
            return $thread ? ['id' => $thread['conversation'].'|'.$thread['activity']] : null;
        }
        $activityId = $this->bot->sendToConversation($channelId, $text);
        return $activityId ? ['id' => $channelId.'|'.$activityId] : null;
    }
    public function updatePost(string $id, string $message, $props = null, ?string $channelId = null) {
        [$conversationId, $activityId] = array_pad(explode('|', $id, 2), 2, null);
        if ($conversationId && $activityId) {
            $this->bot->updateActivity($conversationId, $activityId, $this->toTeamsMessage($message, $props ?? []));
        }
        return null;
    }
    private function toTeamsMessage(string $message, array $props): string {
        $parts = array_filter([
            isset($props['username']) ? '**'.$props['username'].'**' : null,
            trim($message),
            ...array_map(fn (array $attachment) => '> '.trim(($attachment['author_name'] ?? '').': '.($attachment['text'] ?? ''), ': '), $props['attachments'] ?? []),
        ]);
        return TeamsMarkdown::from(implode("\n", $parts));
    }
    public function getChannelPosts(string $channelId, int $page = 0, int $perPage = 200): array {
        return [];
    }
    public function getDirectChannelIdFor(string $userId): ?string {
        return $this->bot->personalConversation($userId);
    }

    // ###### channels

    public function createChannel(string $name, string $display_name, string $purpose, string $header): ?string {
        $description = trim(trim($purpose."\n".$header)."\n[$name]");
        $displayName = Str::limit(trim(preg_replace('/[#%&*{}\/\\\\:<>?+|\'"~]/', ' ', $display_name ?: $name)), self::NAME_MAX_LENGTH, '');
        try {
            return $this->graph->createChannel($this->teamId(), $displayName, $description);
        } catch (\Throwable $e) {
            return $this->getChannelId($name);
        }
    }
    public function getChannelId(string $name): ?string {
        foreach ($this->graph->channels($this->teamId()) as $channel) {
            if (str_contains((string)($channel['description'] ?? ''), "[$name]")) {
                return $channel['id'];
            }
        }
        return null;
    }
    public function addUsersToChannel(string $channelId, User ...$users) {
        foreach ($users as $user) {
            if ($userId = $this->getUserId($user)) {
                $this->graph->addTeamMember($this->teamId(), $userId);
            }
        }
    }
    public function removeUserFromChannel($channelId, User $user) {}

    // ###### plugin-specific abstractions

    public function getImageMarkdown(string $path, string $title = 'image'): string {
        return '!['.$title.']('.config('app.api_url').'../'.$path.")\n";
    }
    public function getIconFor(Project $project): string {
        $channelId = $this->getChannelIdFor($project);
        if (! $channelId) {
            return '';
        }
        return '[Teams](https://teams.microsoft.com/l/channel/'.rawurlencode($channelId).'/'.rawurlencode($project->name).'?groupId='.$this->teamId().'&tenantId='.$this->env('TENANT_ID').')';
    }
}
