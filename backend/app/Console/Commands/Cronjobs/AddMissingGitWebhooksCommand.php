<?php

namespace App\Console\Commands\Cronjobs;

use App\Helpers\NLog;
use App\Http\Controllers\PluginGitController;
use App\Models\PluginLink;
use Illuminate\Console\Command;

class AddMissingGitWebhooksCommand extends Command {
    protected $signature   = 'webhooks:add-missing {--fresh=}';
    protected $description = 'Adds missing Git webhooks to GitLab projects';
    private $git;

    public function __construct(PluginGitController $git) {
        parent::__construct();
        $this->git = $git;
    }
    public function handle() {
        $fresh = $this->option('fresh');
        if (! $this->git->env('URL')) {
            NLog::error('<AddMissingGitWebhooksCommand> No GitLab credentials set');
            return;
        }
        if (preg_match('/(localhost|127.0.0.1)/is', config('app.api_url'))) {
            NLog::error('<AddMissingGitWebhooksCommand> Cannot use this command from local environment');
            return;
        }

        $links = PluginLink::where('type', 'git');

        if (! $fresh) {
            $links->whereFlag(PluginLink::FLAG_GITLAB_HOOKED, cmp: '!=');
        }

        $links = $links->get();
        foreach ($links as $link) {
            if ($this->parsePluginLink($link)) {
                $link->setFlag(PluginLink::FLAG_GITLAB_HOOKED);
                $link->save();
            }
        }
    }
    public function parsePluginLink(PluginLink $link): bool {
        if (! str_starts_with($link->url, config('services.gitlab.url'))) {
            NLog::error("<AddMissingGitWebhooksCommand> TALVIS does not support linking another GitLab instance '$link->url' != '".config('app.url')."'");
            return true;
        }
        try {
            $hookResponse = $this->git->indexWebhooks($link);
            if ($hookResponse === null) {
                return false;
            }
            if (is_array($hookResponse)) {
                $hooks = $hookResponse;
            } else {
                $hooks = json_decode($hookResponse->getBody());
            }
            $hasHook = false;
            foreach ($hooks as $hook) {
                if (str_starts_with($hook->url, config('app.api_url'))) {
                    $hasHook = true;
                }
            }
            if ($hasHook) {
                return true;
            }
            $this->git->storeWebhook($link);
            NLog::info("<AddMissingGitWebhooksCommand> '$link->url' hook added");
            return true;
        } catch (\Exception $e) {
            NLog::warning("<AddMissingGitWebhooksCommand> '$link->url' could not be resolved");
            return true;
        }
    }
}
