<?php

namespace App\Console\Commands\Cronjobs;

use App\Http\Controllers\PluginGitController;
use App\Models\GitlabAuditProject;
use Illuminate\Console\Command;

class RunGitlabAudits extends Command {
    protected $signature   = 'cron:gitlab-audits';
    protected $description = 'Retries the audit jobs of each audit project\'s latest deployment pipeline when its cron is due';

    public function handle(PluginGitController $git) {
        GitlabAuditProject::whereNotNull('cron')->get()
            ->filter(fn (GitlabAuditProject $project) => $project->isDue())
            ->each(function (GitlabAuditProject $project) use ($git) {
                $project->runAudit($git);
                $this->line("{$project->namespace_with_path}: {$project->last_status}");
            });
    }
}
