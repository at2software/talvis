<?php

namespace App\Jobs;

use App\Http\Controllers\PluginChatController;
use App\Models\PluginLink;
use App\Traits\GitWebhookTrait;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(\Illuminate\Support\Collection $links, array{id: int, name: string, web_url: string} $project, array{status: string, ref: string, id: int} $objectAttributes, array<int, array{id: int, name: string, status: string, stage?: string}> $builds)
 */
class GitPipelineWebhookJob implements ShouldQueue {
    use Dispatchable;
    use GitWebhookTrait;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param Collection<int, PluginLink> $links
     * @param array{id: int, name: string, web_url: string} $project
     * @param array{status: string, ref: string, id: int} $objectAttributes
     * @param array<int, array{id: int, name: string, status: string, stage?: string}> $builds
     */
    public function __construct(
        private Collection $links,
        private array $project,
        private array $objectAttributes,
        private array $builds,
    ) {}

    public function handle(): void {
        if ($this->links->isEmpty()) {
            return;
        }

        $emoji      = $this->emojiForStatus($this->objectAttributes['status']);
        $projectUrl = $this->project['web_url'];
        $ref        = $this->objectAttributes['ref'];
        $message    = "[`$emoji ⎇ $ref`]($projectUrl): ";

        $message .= $this->pipelineJobList($this->builds, $projectUrl);

        $cacheId                 = 'git_pipeline_'.$this->objectAttributes['id'];
        $props                   = $this->props($this->project['name']);
        $props['nexus_cache_id'] = $cacheId;
        $siblings                = $this->links->siblingsOfType(PluginChatController::class)->unique('channelId')->values();

        foreach ($siblings as $chatInfo) {
            ChatSendMessageJob::dispatch(
                $message,
                $props,
                channelId: $chatInfo['channelId'],
                cacheId: $cacheId,
            );
        }

        if ($siblings->isEmpty()) {
            $this->notifyProjectManager("⚠️ **{$this->project['web_url']}** is building but has no chat channel configured.");
        }
    }
}
