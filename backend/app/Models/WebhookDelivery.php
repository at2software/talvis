<?php

namespace App\Models;

use App\Services\SafeUrlGuard;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class WebhookDelivery extends Model {
    public const MAX_ATTEMPTS     = 8;
    private const BACKOFF_MINUTES = [1, 5, 30, 120, 360, 720, 1440];
    private const TIMEOUT_SECONDS = 10;

    protected $fillable = ['uuid', 'event', 'payload', 'attempts', 'next_attempt_at', 'delivered_at', 'response_status', 'last_error'];

    protected function casts(): array {
        return [
            'payload'         => 'array',
            'next_attempt_at' => 'datetime',
            'delivered_at'    => 'datetime',
        ];
    }
    public function endpoint(): BelongsTo {
        return $this->belongsTo(WebhookEndpoint::class, 'webhook_endpoint_id');
    }
    public function scopeDue($query) {
        return $query->whereNull('delivered_at')
            ->whereNotNull('next_attempt_at')
            ->where('next_attempt_at', '<=', now())
            ->where('attempts', '<', self::MAX_ATTEMPTS);
    }
    public function send(SafeUrlGuard $guard): bool {
        $endpoint  = $this->endpoint;
        $body      = json_encode($this->payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $timestamp = now()->timestamp;
        $this->attempts++;

        try {
            $response = Http::withOptions(['allow_redirects' => false, 'curl' => $guard->pinnedCurlOptions($endpoint->url)])
                ->timeout(self::TIMEOUT_SECONDS)
                ->withHeaders([
                    'webhook-id'        => $this->uuid,
                    'webhook-timestamp' => (string)$timestamp,
                    'webhook-signature' => $endpoint->signature($this->uuid, $timestamp, $body),
                    'User-Agent'        => 'TALVIS-Webhooks/1',
                ])
                ->withBody($body, 'application/json')
                ->post($endpoint->url);
            $this->response_status = $response->status();
            $this->last_error      = $response->successful() ? null : Str::limit($response->body(), 1000);
        } catch (\Throwable $e) {
            $this->response_status = null;
            $this->last_error      = Str::limit($e->getMessage(), 1000);
        }

        $delivered = $this->last_error === null;
        if ($delivered) {
            $this->delivered_at    = now();
            $this->next_attempt_at = null;
            $endpoint->forceFill(['last_delivered_at' => now(), 'failure_count' => 0])->save();
        } else {
            $backoff               = self::BACKOFF_MINUTES[$this->attempts - 1] ?? null;
            $this->next_attempt_at = $backoff && $this->attempts < self::MAX_ATTEMPTS ? now()->addMinutes($backoff) : null;
            $endpoint->forceFill(['last_failed_at' => now(), 'failure_count' => $endpoint->failure_count + 1])->save();
        }
        $this->save();
        return $delivered;
    }
}
