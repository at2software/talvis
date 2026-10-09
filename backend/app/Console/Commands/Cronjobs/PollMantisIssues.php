<?php

namespace App\Console\Commands\Cronjobs;

use App\Http\Controllers\PluginMantisController;
use App\Jobs\MantisIssueEventJob;
use App\Models\PluginLink;
use App\Support\MantisIssueChanges;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class PollMantisIssues extends Command {
    protected $signature   = 'cron:mantis-issue-events';
    protected $description = 'Post new, changed and commented Mantis issues of linked projects to their chat channels (every 5 minutes)';

    public function handle() {
        $mantis = PluginMantisController::createInstance();
        if (! $mantis) {
            $this->warn('Mantis vault not configured, skipping.');
            return 0;
        }

        $linksByProject = PluginLink::where('type', 'mantis')->with('parent')->get()
            ->groupBy(fn (PluginLink $link) => $mantis->projectIdFromLink($link->url))
            ->except(['']);

        foreach ($linksByProject as $mantisProjectId => $links) {
            $cursorKey = 'mantis_poll_'.hash('sha256', $mantis->baseUrl()).'_'.$mantisProjectId;
            $since     = Cache::get($cursorKey);
            $polledAt  = now();
            if (! $since) {
                Cache::forever($cursorKey, $polledAt->toIso8601String());
                continue;
            }
            $since = Carbon::parse($since);

            foreach ($mantis->issuesUpdatedSince((int)$mantisProjectId, $since) as $issue) {
                $snapshotKey = 'mantis_issue_'.hash('sha256', $mantis->baseUrl()).'_'.$issue['id'];
                foreach (MantisIssueChanges::between($issue, Cache::get($snapshotKey), $since) as $change) {
                    MantisIssueEventJob::dispatch($links, $issue, $mantis->issueUrl($issue['id']), $change);
                }
                Cache::put($snapshotKey, MantisIssueChanges::snapshot($issue), now()->addDays(90));
            }
            Cache::forever($cursorKey, $polledAt->toIso8601String());
        }
        return 0;
    }
}
