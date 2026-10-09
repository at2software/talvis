<?php

namespace App\Console\Commands\Cronjobs;

use App\Jobs\ChatSendMessageJob;
use App\Models\User;
use App\Models\Vault;
use App\Services\MicrosoftGraph;
use Carbon\Carbon;
use Illuminate\Console\Command;

class WarnMicrosoft365SecretExpiry extends Command {
    private const WARN_DAYS = [30, 14, 7, 3, 1];

    protected $signature   = 'cron:m365-secret-expiry';
    protected $description = 'Remind admins in chat before the Microsoft 365 client secret expires (daily)';

    public function handle() {
        $expiresAt = Vault::getCredentials(MicrosoftGraph::VAULT)[MicrosoftGraph::VAULT.'_SECRET_EXPIRES_AT'] ?? null;
        if (! $expiresAt || ! strtotime($expiresAt)) {
            return 0;
        }
        $daysLeft = (int)today()->diffInDays(Carbon::parse($expiresAt)->startOfDay(), false);
        if (! in_array($daysLeft, self::WARN_DAYS, true)) {
            return 0;
        }

        $message = "⚠️ **Microsoft 365:** the TALVIS client secret expires in **$daysLeft day(s)** ($expiresAt). Create a new secret in Entra (App registrations → TALVIS → Certificates & secrets) and enter it under Settings → Connectors → Microsoft 365.";
        foreach (User::role('admin')->get() as $admin) {
            ChatSendMessageJob::dispatch($message, user: $admin);
        }
        return 0;
    }
}
