<?php

namespace App\Console\Commands\Cronjobs;

use App\Helpers\NLog;
use App\Models\User;
use Illuminate\Console\Command;

class TimetrackerResetIdle extends Command {
    const DIFF_MIN = 5;

    protected $signature   = 'timetracker:reset-idle';
    protected $description = 'Automatically resets the current focus to `null` for users that have not reported a new project within the last 5 minutes';

    public function handle() {
        $users = User::whereBefore(now()->subMinutes(self::DIFF_MIN), 'updated_at')->whereNotNull('current_focus_id')->get();
        foreach ($users as $user) {
            NLog::info("setting idle $user->name $user->updated_at");
            $user->clearCurrentFocus();
        }
    }
}
