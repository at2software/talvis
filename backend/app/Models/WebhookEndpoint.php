<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class WebhookEndpoint extends BaseModel {
    private const SECRET_PREFIX = 'whsec_';

    protected $fillable = ['name', 'url', 'is_active', 'created_by_id'];
    protected $hidden   = ['secret'];
    protected $appends  = ['class'];

    protected function casts(): array {
        return [
            'secret'            => 'encrypted',
            'is_active'         => 'boolean',
            'last_delivered_at' => 'datetime',
            'last_failed_at'    => 'datetime',
        ];
    }
    protected static function booted() {
        parent::booted();
        static::creating(function (self $endpoint) {
            $endpoint->secret ??= self::newSecret();
        });
    }
    public static function newSecret(): string {
        return self::SECRET_PREFIX.base64_encode(random_bytes(32));
    }
    public function deliveries(): HasMany {
        return $this->hasMany(WebhookDelivery::class);
    }
    public function queue(string $event, array $data): WebhookDelivery {
        $uuid = (string)Str::uuid();
        return $this->deliveries()->create([
            'uuid'            => $uuid,
            'event'           => Str::limit($event, 64, ''),
            'payload'         => ['id' => $uuid, 'type' => $event, 'timestamp' => now()->toIso8601String(), 'data' => $data],
            'next_attempt_at' => now(),
        ]);
    }

    /**
     * @see https://www.standardwebhooks.com/
     */
    public function signature(string $messageId, int $timestamp, string $body): string {
        $key = base64_decode(Str::after($this->secret, self::SECRET_PREFIX));
        return 'v1,'.base64_encode(hash_hmac('sha256', "$messageId.$timestamp.$body", $key, true));
    }

    public function rotateSecret(): string {
        $this->secret = self::newSecret();
        $this->save();
        return $this->secret;
    }
}
