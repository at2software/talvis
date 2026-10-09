<?php

namespace App\Services;

use App\Jobs\ChatSendMessageJob;
use App\Mail\UptimeDownMail;
use App\Mail\UptimeUpMail;
use App\Models\UptimeCheck;
use App\Models\UptimeMonitor;
use App\Support\ChatProps;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class UptimeNotificationService {
    public function notifyDown(UptimeMonitor $monitor, UptimeCheck $check): void {
        $this->sendNotifications($monitor, $check, false);

        $monitor->update(['last_notified_at' => now()]);
    }
    public function notifyRecovery(UptimeMonitor $monitor, UptimeCheck $check): void {
        $this->sendNotifications($monitor, $check, true);
    }
    private function sendNotifications(UptimeMonitor $monitor, UptimeCheck $check, bool $isRecovery): void {
        $recipients = $this->getRecipients($monitor);

        $emailRecipients = $recipients->filter(function ($recipient) use ($isRecovery) {
            if ($isRecovery) {
                return $recipient->notify_via_email && $recipient->notify_on_recovery;
            }
            return $recipient->notify_via_email;
        });

        $chatRecipients = $recipients->filter(function ($recipient) use ($isRecovery) {
            if ($isRecovery) {
                return $recipient->notify_via_chat && $recipient->notify_on_recovery;
            }
            return $recipient->notify_via_chat;
        });

        $this->sendEmails($monitor, $check, $emailRecipients, $isRecovery);

        $this->sendChatMessages($monitor, $check, $isRecovery);
    }
    private function getRecipients(UptimeMonitor $monitor): Collection {
        $monitor->load(['projects.projectManager', 'recipients', 'createdBy']);

        if ($monitor->projects->isEmpty()) {
            $creator = $monitor->createdBy;
            if ($creator) {
                return collect([
                    (object)[
                        'user'               => $creator,
                        'email'              => $creator->email,
                        'notify_via_email'   => true,
                        'notify_via_chat'    => true,
                        'notify_on_recovery' => true,
                    ],
                ]);
            }
            return collect();
        }

        $projectManagers = $monitor->projects->map(fn ($project) => [
            'user'               => $project->projectManager,
            'email'              => $project->projectManager?->email,
            'project_id'         => $project->id,
            'notify_via_email'   => true,
            'notify_via_chat'    => true,
            'notify_on_recovery' => true,
        ])->filter(fn ($data) => $data['user'] !== null);

        $explicitRecipients = $monitor->recipients->map(fn ($user) => [
            'user'               => $user,
            'email'              => $user->email,
            'notify_via_email'   => (bool)$user->pivot->notify_via_email,
            'notify_via_chat'    => (bool)$user->pivot->notify_via_chat,
            'notify_on_recovery' => (bool)$user->pivot->notify_on_recovery,
        ]);

        $allRecipients = $projectManagers->concat($explicitRecipients);

        $uniqueRecipients = $allRecipients->unique(function ($recipient) {
            return $recipient['user']->id;
        })->map(function ($recipient) {
            return (object)$recipient;
        });
        return $uniqueRecipients;
    }
    private function sendEmails(UptimeMonitor $monitor, UptimeCheck $check, $recipients, bool $isRecovery): void {
        $uniqueEmails = $recipients->pluck('email')->unique()->filter();

        $mailClass = $isRecovery ? UptimeUpMail::class : UptimeDownMail::class;

        foreach ($uniqueEmails as $email) {
            try {
                Mail::to($email)->send(new $mailClass($monitor, $check));
                Log::info("Uptime notification email sent to {$email} for monitor {$monitor->id}");
            } catch (\Exception $e) {
                Log::error("Failed to send uptime notification email to {$email}: ".$e->getMessage());
            }
        }
    }
    private function sendChatMessages(UptimeMonitor $monitor, UptimeCheck $check, bool $isRecovery): void {
        $monitor->load('projects');

        if ($monitor->projects->isEmpty()) {
            return;
        }

        $uniqueProjects = $monitor->projects->unique('id');
        $message        = $this->formatChatMessage($monitor, $check, $isRecovery);

        $props = $isRecovery
            ? ChatProps::sender('Service Recovered', asset('icons/icon-uptime-recovered.png'))
            : ChatProps::sender('Uptime Alert', asset('icons/icon-uptime-warning.png'));

        foreach ($uniqueProjects as $project) {
            ChatSendMessageJob::dispatch($message, $props, project: $project);
        }
    }
    private function formatChatMessage(UptimeMonitor $monitor, UptimeCheck $check, bool $isRecovery): string {
        if ($isRecovery) {
            return "### Service Recovered\n\n".
                   "**{$monitor->name}** is back online\n\n".
                   "- **URL**: {$monitor->url}\n".
                   "- **Status**: UP\n".
                   "- **Response Time**: {$check->response_time}ms\n".
                   "- **Recovered At**: {$check->checked_at->format('Y-m-d H:i:s')}";
        }

        $message = "### Uptime Alert\n\n".
                   "**{$monitor->name}** is currently down\n\n".
                   "- **URL**: {$monitor->url}\n".
                   '- **Status**: '.strtoupper($check->status)."\n";

        if ($check->status_code) {
            $message .= "- **Status Code**: {$check->status_code}\n";
        }

        if ($check->response_time) {
            $message .= "- **Response Time**: {$check->response_time}ms\n";
        }

        if ($check->error_message) {
            $message .= "- **Error**: {$check->error_message}\n";
        }

        $message .= "- **Checked At**: {$check->checked_at->format('Y-m-d H:i:s')}";
        return $message;
    }
}
