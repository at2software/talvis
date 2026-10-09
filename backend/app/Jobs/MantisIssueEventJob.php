<?php

namespace App\Jobs;

use App\Http\Controllers\PluginChatController;
use App\Models\PluginLink;
use App\Support\ChatProps;
use App\Support\MantisIssueChanges;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(\Illuminate\Support\Collection $links, array $issue, string $issueUrl, array $change)
 */
class MantisIssueEventJob implements ShouldQueue {
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param Collection<int, PluginLink> $links
     * @param array<string, mixed> $issue
     * @param array{action: string, by?: ?string, text?: string, status?: string, handler?: ?string} $change
     */
    public function __construct(
        private Collection $links,
        private array $issue,
        private string $issueUrl,
        private array $change,
    ) {}

    public function handle(): void {
        $props = ChatProps::sender($this->issue['project']['name'] ?? 'Mantis', asset('icons/mantis.png'));
        if (! empty($this->change['text'])) {
            $props['attachments'] = [ChatProps::attachment($this->change['text'], $this->change['by'] ?? null, $this->change['action'] === 'note' ? '#0A8BC9' : '#FFA200')];
        }

        $siblings = $this->links->siblingsOfType(PluginChatController::class)->unique('channelId')->values();
        foreach ($siblings as $chatInfo) {
            ChatSendMessageJob::dispatch($this->message(), $props, channelId: $chatInfo['channelId'], chatKey: $chatInfo['controller']::getKey());
        }
    }
    public function message(): string {
        $emoji  = MantisIssueChanges::isDone($this->issue['status']['name'] ?? null) ? '✅' : '⚠️';
        $prefix = "[`$emoji #{$this->issue['id']}`]({$this->issueUrl}) {$this->issue['summary']}";
        $by     = isset($this->change['by']) ? ' by **'.$this->change['by'].'**' : '';

        return $prefix.match ($this->change['action']) {
            'open'   => ' → opened'.$by.$this->handlerSuffix($this->issue['handler']['name'] ?? null),
            'close'  => " → `{$this->change['status']}`",
            'reopen' => " → reopened (`{$this->change['status']}`)",
            'status' => " → `{$this->change['status']}`",
            'assign' => $this->change['handler'] ? ' → assigned to **'.$this->change['handler'].'**' : ' → unassigned',
            'note'   => ' → commented'.$by,
        };
    }
    private function handlerSuffix(?string $handler): string {
        return $handler ? " (→ **$handler**)" : ' (unassigned)';
    }
}
