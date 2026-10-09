<?php

namespace App\Jobs;

use App\Http\Controllers\PluginChatController;
use App\Models\PluginLink;
use App\Support\ChatProps;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(\Illuminate\Support\Collection $links, array{name: string, web_url: string} $project, array{action: string, state_id: int, iid: int, title: string, description: string} $objectAttributes, array{name: string} $user, array<int, array{name: string, avatar_url: string}> $assignees, array{state_id?: int, assignees?: array{previous: array<int, array{name: string}>, current: array<int, array{name: string}>}, labels?: array{previous: array<int, array{title: string}>, current: array<int, array{title: string}>}} $changes)
 */
class GitIssueWebhookJob implements ShouldQueue {
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param Collection<int, PluginLink> $links
     * @param array{name: string, web_url: string} $project
     * @param array{action: string, state_id: int, iid: int, title: string, description: string} $objectAttributes
     * @param array{name: string} $user
     * @param array<int, array{name: string, avatar_url: string}> $assignees
     * @param array{state_id?: int, assignees?: array{previous: array<int, array{name: string}>, current: array<int, array{name: string}>}, labels?: array{previous: array<int, array{title: string}>, current: array<int, array{title: string}>}} $changes
     */
    public function __construct(
        private Collection $links,
        private array $project,
        private array $objectAttributes,
        private array $user,
        private array $assignees,
        private array $changes,
    ) {}

    public function handle(): void {
        if ($this->objectAttributes['action'] === 'update' && isset($this->changes['state_id'])) {
            return;
        }

        $emoji  = $this->emojiForIssueState($this->objectAttributes['state_id']);
        $iid    = $this->objectAttributes['iid'];
        $url    = $this->project['web_url'].'/-/issues/'.$iid;
        $prefix = "[`$emoji #$iid`]($url)";
        $title  = $this->objectAttributes['title'];
        $action = $this->objectAttributes['action'];
        $by     = '**'.$this->user['name'].'**';

        $props   = $this->props($this->project['name']);
        $message = "$prefix $title";

        if ($action === 'open') {
            $message .= $this->assigneesSuffix();
            $message .= " → opened by $by";
            $desc = trim($this->objectAttributes['description']);
            if ($desc !== '') {
                $props['attachments'] = [ChatProps::attachment($this->objectAttributes['description'], $this->user['name'], '#FFA200')];
            }
        } elseif ($action === 'close') {
            $message .= " → closed by $by";
        } elseif ($action === 'reopen') {
            $message .= " → reopened by $by";
        } elseif ($action === 'update') {
            $message .= $this->buildUpdateSuffix($by);
        } else {
            $message .= " → `$action` by $by";
        }

        $siblings = $this->links->siblingsOfType(PluginChatController::class)->unique('channelId')->values();
        foreach ($siblings as $chatInfo) {
            ChatSendMessageJob::dispatch($message, $props, channelId: $chatInfo['channelId'], chatKey: $chatInfo['controller']::getKey());
        }
    }
    private function assigneesSuffix(): string {
        if (empty($this->assignees)) {
            return ' (unassigned)';
        }
        $avatars = '';
        foreach ($this->assignees as $assignee) {
            $avatars .= '!['.$assignee['name'].']('.$assignee['avatar_url'].' =16 "'.$assignee['name'].'")';
        }
        return " ($avatars)";
    }
    private function buildUpdateSuffix(string $by): string {
        if (isset($this->changes['assignees'])) {
            $current = $this->changes['assignees']['current'] ?? [];
            if (empty($current)) {
                return " → unassigned by $by";
            }
            $names = implode(', ', array_map(fn ($a) => '**'.$a['name'].'**', $current));
            return " → assigned to $names by $by";
        }

        if (isset($this->changes['labels'])) {
            $prev    = array_column($this->changes['labels']['previous'] ?? [], 'title');
            $curr    = array_column($this->changes['labels']['current'] ?? [], 'title');
            $added   = array_diff($curr, $prev);
            $removed = array_diff($prev, $curr);
            $parts   = [];
            foreach ($added as $label) {
                $parts[] = "`+$label`";
            }
            foreach ($removed as $label) {
                $parts[] = "`-$label`";
            }
            return ' → label '.implode(' ', $parts)." by $by";
        }
        return " → updated by $by";
    }
    private function props(string $name): array {
        return ChatProps::sender($name, asset('icons/icon.git.big.png'));
    }
    private function emojiForIssueState(string $status): string {
        return match ((int)$status) {
            2       => '✅',
            default => '⚠️',
        };
    }
}
