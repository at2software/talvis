<?php

namespace App\Console\Commands;

use App\Services\MicrosoftGraph;
use App\Services\TeamsAppPackage;
use Illuminate\Console\Command;

class BuildTeamsAppPackage extends Command {
    protected $signature   = 'teams:app-package {--app-version=1.0.0}';
    protected $description = 'Build talvis-teams.zip (manifest + icons) for upload in the Teams admin center, using the client id of the M365 vault';

    public function handle() {
        $appId = MicrosoftGraph::fromVault()?->credentialValue('CLIENT_ID');
        if (! $appId) {
            $this->error('Configure the Microsoft 365 connector (client id) first.');
            return 1;
        }
        $path = TeamsAppPackage::build($appId, storage_path('app/'.TeamsAppPackage::FILENAME), $this->option('app-version'));
        $this->info("Teams app package written to $path");
        return 0;
    }
}
