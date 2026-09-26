<?php

namespace App\Jobs;

use App\Http\Controllers\PluginChatController;
use App\Http\Controllers\PluginGitController;
use App\Models\PluginLink;
use App\Traits\GitWebhookTrait;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Collection;

/**
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(\Illuminate\Support\Collection $links, array{id: int, name: string, web_url: string} $project, array{build_id: int, build_name: string, build_status: string, pipeline_id: int, ref: string} $buildData, array<string, string> $credentials)
 */
class GitBuildWebhookJob implements ShouldQueue {
    use Dispatchable;
    use GitWebhookTrait;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * @param Collection<int, PluginLink> $links
     * @param array{id: int, name: string, web_url: string} $project
     * @param array{build_id: int, build_name: string, build_status: string, pipeline_id: int, ref: string} $buildData
     * @param array<string, string> $credentials
     */
    public function __construct(
        private Collection $links,
        private array $project,
        private array $buildData,
        private array $credentials = [],
    ) {}

    public function handle(): void {
        if ($this->links->isEmpty()) {
            return;
        }

        $controller = new PluginGitController($this->credentials);
        $projectId  = $this->project['id'];
        $projectUrl = $this->project['web_url'];
        $pipelineId = $this->buildData['pipeline_id'];
        $ref        = $this->buildData['ref'];

        $pipeline = $controller->getPipeline($projectId, $pipelineId);
        $jobs     = $controller->getPipelineJobs($projectId, $pipelineId) ?? [];

        $pipelineStatus = $pipeline['status'] ?? 'running';
        $emoji          = $this->emojiForStatus($pipelineStatus);
        $message        = "[`$emoji ⎇ $ref`]($projectUrl): ";

        $message .= $this->pipelineJobList($jobs, $projectUrl);

        $cacheId                 = 'git_pipeline_'.$pipelineId;
        $props                   = $this->props($this->project['name']);
        $props['nexus_cache_id'] = $cacheId;
        $siblings                = $this->links->siblingsOfType(PluginChatController::class)->unique('channelId')->values();

        foreach ($siblings as $chatInfo) {
            ChatSendMessageJob::dispatch($message, $props, channelId: $chatInfo['channelId'], cacheId: $cacheId);
        }

        if ($siblings->isEmpty()) {
            $this->notifyProjectManager("⚠️ **{$this->project['web_url']}** is building but has no chat channel configured.");
        }

        if (in_array($this->buildData['build_status'], ['success', 'failed'], true)) {
            $this->dispatchSecurityReport(
                $this->buildData['build_name'],
                $this->buildData['build_id'],
                $props,
            );
        }
    }
}
