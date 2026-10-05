<?php

namespace App\Console\Commands;

use App\Enums\VacationState;
use App\Helpers\NLog;
use App\Http\Controllers\PluginChatController;
use App\Http\Controllers\PluginController;
use App\Models\User;
use App\Models\Vacation;
use Carbon\Carbon;
use Illuminate\Console\Command;

class UpdateVacationStatusCommand extends Command {
    /**
     * @var string
     */
    protected $signature = 'vacation:update-status';

    /**
     * @var string
     */
    protected $description = 'Update user status in chat systems based on vacation start/end dates';

    public function handle() {
        $this->info('Starting vacation status update...');

        $today         = Carbon::today();
        $affectedUsers = collect();

        $startingVacations = Vacation::whereDate('started_at', $today)
            ->whereIn('state', [VacationState::Approved, VacationState::Sick])
            ->with('user')
            ->get();

        foreach ($startingVacations as $vacation) {
            if ($vacation->user) {
                $this->updateUserStatus($vacation->user, $this->getVacationStatus($vacation), 'starting');
                $affectedUsers->push($vacation->user->name);
            }
        }

        $endingVacations = Vacation::whereDate('ended_at', $today)
            ->whereIn('state', [VacationState::Approved, VacationState::Sick])
            ->with('user')
            ->get();

        foreach ($endingVacations as $vacation) {
            if ($vacation->user) {
                $this->updateUserStatus($vacation->user, 'online', 'ending');
                $affectedUsers->push($vacation->user->name);
            }
        }

        $uniqueUsers = $affectedUsers->unique();

        if ($uniqueUsers->isNotEmpty()) {
            $this->info('Updated status for '.$uniqueUsers->count().' users: '.$uniqueUsers->join(', '));
            NLog::info('Vacation status update completed', ['affected_users' => $uniqueUsers->toArray()]);
        } else {
            $this->info('No vacation status updates needed today.');
        }
        return 0;
    }
    private function updateUserStatus(User $user, string $status, string $action) {
        $chatControllers = PluginController::getPluginControllers(PluginChatController::class);

        if (empty($chatControllers)) {
            $this->warn("No chat controllers available for user {$user->name}");
            return;
        }

        foreach ($chatControllers as $chatController) {
            try {
                if ($userId = $chatController->getIdFor($user)) {
                    $chatController->updateStatus($status, $userId);
                    $this->line("Updated {$user->name} to '{$status}' in ".class_basename($chatController)." (vacation {$action})");
                }
            } catch (\Exception $e) {
                $this->error("Failed to update {$user->name} in ".class_basename($chatController).': '.$e->getMessage());
                NLog::error('Chat status update failed', [
                    'user'       => $user->name,
                    'controller' => class_basename($chatController),
                    'error'      => $e->getMessage(),
                ]);
            }
        }
    }
    private function getVacationStatus(Vacation $vacation): string {
        if ($vacation->state === VacationState::Sick) {
            return 'medical_symbol';
        }
        return 'vacation'; // For approved vacations
    }
}
