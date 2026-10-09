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
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(\Illuminate\Support\Collection $links, array{name: string, web_url: string} $project, array{iid: int, title: string, state_id: int} $issue, array{note: string} $objectAttributes, array{name: string} $user)
 */
class GitNoteWebhookJob implements ShouldQueue {
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param Collection<int, PluginLink> $links
     * @param array{name: string, web_url: string} $project
     * @param array{iid: int, title: string, state_id: int} $issue
     * @param array{note: string} $objectAttributes
     * @param array{name: string} $user
     */
    public function __construct(
        private Collection $links,
        private array $project,
        private array $issue,
        private array $objectAttributes,
        private array $user,
    ) {}

    public function handle(): void {
        $emoji   = $this->emojiForIssueState($this->issue['state_id']);
        $iid     = $this->issue['iid'];
        $url     = $this->project['web_url'].'/-/issues/'.$iid;
        $message = "[`$emoji #$iid`]($url) ".$this->issue['title'];

        $props = [
            ...$this->props('GitLab Note'),
            'attachments' => [ChatProps::attachment($this->objectAttributes['note'], $this->user['name'], '#0A8BC9')],
        ];

        $siblings = $this->links->siblingsOfType(PluginChatController::class)->unique('channelId')->values();
        foreach ($siblings as $chatInfo) {
            ChatSendMessageJob::dispatch($message, $props, channelId: $chatInfo['channelId'], chatKey: $chatInfo['controller']::getKey());
        }
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
