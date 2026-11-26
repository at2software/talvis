<?php

namespace App\Console\Commands\Cronjobs;

use App\Http\Controllers\PluginMattermostController;
use App\Models\Project;
use Illuminate\Console\Command;
use Throwable;

class SyncChatChannelHeaders extends Command {
    protected $signature   = 'cron:chat-channel-headers';
    protected $description = 'Keep the Mattermost channel header of every running project in sync with its TALVIS links';

    public function handle(): int {
        $mattermost = PluginMattermostController::createInstance();
        if (! $mattermost) {
            $this->info('Mattermost is not configured.');
            return self::SUCCESS;
        }
        $channels = [];
        foreach (Project::whereRunning()->with('pluginLinks')->get() as $project) {
            try {
                if ($channelId = $mattermost->getChannelIdFor($project)) {
                    $channels[$channelId][] = $project;
                }
            } catch (Throwable $e) {
                $this->warn("{$project->id} {$project->name}: {$e->getMessage()}");
            }
        }
        $updated = 0;
        foreach ($channels as $channelId => $projects) {
            try {
                $updated += (int)$mattermost->syncChannelHeader($channelId, $projects);
            } catch (Throwable $e) {
                $this->warn("{$channelId}: {$e->getMessage()}");
            }
        }
        $this->info("{$updated} channel headers updated.");
        return self::SUCCESS;
    }
}
