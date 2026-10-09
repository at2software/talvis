<?php

namespace App\Console\Commands\Cronjobs;

use App\Helpers\NLog;
use App\Models\User;
use App\Services\MicrosoftGraph;
use Illuminate\Console\Command;

class ScheduleOutlookAutomaticReplies extends Command {
    private const LOOKAHEAD_DAYS = 14;

    protected $signature   = 'cron:m365-automatic-replies';
    protected $description = 'Schedule the Outlook automatic reply of opted-in users for their next approved vacation (daily)';

    public function handle() {
        $graph = MicrosoftGraph::fromVault();
        if (! $graph) {
            $this->warn('Microsoft 365 vault not configured, skipping.');
            return 0;
        }

        foreach (User::all()->filter(fn (User $user) => $user->usesMicrosoft365('M365_AUTOREPLY')) as $user) {
            $vacation = $user->upcomingVacation(self::LOOKAHEAD_DAYS);
            if (! $vacation) {
                continue;
            }
            $message = strtr((string)$user->param('M365_AUTOREPLY_TEXT', true)->value, [
                '{name}'  => $user->name,
                '{until}' => $vacation->endExclusive()->subDay()->format('d.m.Y'),
            ]);
            $scheduled = $user->param('M365_AUTOREPLY_VACATION_ID');
            $signature = $vacation->id.':'.hash('sha256', $message);
            if ($scheduled->value === $signature) {
                continue;
            }
            try {
                $graph->scheduleAutomaticReplies($user->microsoft365Mailbox(), $vacation->firstDay(), $vacation->endExclusive(), $message);
                $scheduled->value = $signature;
                $scheduled->save();
                $this->line("Scheduled automatic reply for {$user->name} ({$vacation->firstDay()->toDateString()} – {$vacation->endExclusive()->toDateString()})");
            } catch (\Throwable $e) {
                NLog::warning('Outlook automatic reply failed', ['user' => $user->id, 'error' => $e->getMessage()]);
            }
        }
        return 0;
    }
}
