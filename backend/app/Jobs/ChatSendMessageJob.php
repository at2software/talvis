<?php

namespace App\Jobs;

use App\Http\Controllers\PluginChatController;
use App\Http\Controllers\PluginController;
use App\Models\Project;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * @method static \Illuminate\Foundation\Bus\PendingDispatch dispatch(string $message, array $props = [], ?Project $project = null, ?string $channelEnvKey = null, ?string $imagePath = null, bool $appendProjectIcon = false, ?string $channelId = null, ?string $cacheId = null, ?User $user = null, ?string $chatKey = null)
 */
class ChatSendMessageJob implements ShouldQueue {
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        private string $message,
        private array $props = [],
        private ?Project $project = null,
        private ?string $channelEnvKey = null,
        private ?string $imagePath = null,
        private bool $appendProjectIcon = false,
        private ?string $channelId = null,
        private ?string $cacheId = null,
        private ?User $user = null,
        private ?string $chatKey = null,
    ) {}

    public function handle(): void {
        foreach (PluginController::getPluginControllers(PluginChatController::class) as $chatController) {
            if ($this->chatKey && $chatController::getKey() !== $this->chatKey) {
                continue;
            }
            try {
                $userChannelId = null;
                if ($this->user && $userId = $chatController->getUserId($this->user)) {
                    $userChannelId = $chatController->getDirectChannelIdFor($userId);
                }

                $channelId = $this->channelId
                    ?? $userChannelId
                    ?? ($this->channelEnvKey ? $chatController->env($this->channelEnvKey) : null)
                    ?? ($this->project ? $chatController->getChannelIdFor($this->project) : null);

                if ($channelId) {
                    $message = $this->message;
                    if ($this->appendProjectIcon && $this->project) {
                        $message .= $chatController->getIconFor($this->project);
                    }
                    if ($this->imagePath) {
                        $message = $chatController->getImageMarkdown($this->imagePath).$message;
                    }
                    if ($this->cacheId) {
                        $chatController->createOrUpdatePost($this->cacheId, $channelId, $message, $this->props);
                    } else {
                        $chatController->createPost($channelId, $message, $this->props);
                    }
                }
            } catch (\Exception $e) {
            }
        }
    }
}
