<?php

namespace App\Console\Commands\Cronjobs;

use App\Models\WebhookDelivery;
use App\Services\SafeUrlGuard;
use Illuminate\Console\Command;

class DeliverWebhooks extends Command {
    protected $signature   = 'cron:deliver-webhooks {--limit=100}';
    protected $description = 'Send due outgoing webhook deliveries and schedule retries (every minute)';

    public function handle(SafeUrlGuard $guard) {
        $deliveries = WebhookDelivery::due()
            ->whereHas('endpoint', fn ($query) => $query->where('is_active', true))
            ->with('endpoint')
            ->oldest('next_attempt_at')
            ->limit((int)$this->option('limit'))
            ->get();

        $sent = $deliveries->filter(fn (WebhookDelivery $delivery) => $delivery->send($guard))->count();
        $this->info("Delivered {$sent} of {$deliveries->count()} due webhooks.");
        return 0;
    }
}
