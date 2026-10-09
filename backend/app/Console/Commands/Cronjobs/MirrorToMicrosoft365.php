<?php

namespace App\Console\Commands\Cronjobs;

use App\Actions\User\MirrorToMicrosoft365Action;
use App\Helpers\NLog;
use App\Models\User;
use App\Services\MicrosoftGraph;
use Illuminate\Console\Command;

class MirrorToMicrosoft365 extends Command {
    protected $signature   = 'cron:m365-mirror';
    protected $description = 'Mirror the TALVIS calendar and address book into a "TALVIS" calendar and contact folder of each opted-in Microsoft 365 mailbox, and remove them again when switched off (every 30 minutes)';

    public function handle(MirrorToMicrosoft365Action $mirror) {
        $graph = MicrosoftGraph::fromVault();
        if (! $graph) {
            $this->warn('Microsoft 365 vault not configured, skipping.');
            return 0;
        }

        foreach (User::all() as $user) {
            foreach (MirrorToMicrosoft365Action::SETTINGS as $kind => $settings) {
                if (! $user->usesMicrosoft365($settings['toggle']) && ! $user->param($settings['folder'])->value) {
                    continue;
                }
                try {
                    $this->line("{$user->name} $kind: ".json_encode($mirror->execute($user, $kind, $graph)));
                } catch (\Throwable $e) {
                    NLog::warning('Microsoft 365 mirror failed', ['user' => $user->id, 'kind' => $kind, 'error' => $e->getMessage()]);
                }
            }
        }
        return 0;
    }
}
