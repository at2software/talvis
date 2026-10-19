<?php

namespace App\Flow\Models;

use App\Models\BaseModel;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;
use LogicException;

class AuditEntry extends BaseModel {
    public const UPDATED_AT = null;

    protected $table    = 'flow_audit_log';
    protected $fillable = ['subject_type', 'subject_id', 'action', 'actor_id', 'actor_type', 'payload'];
    protected $casts    = ['payload' => 'array'];
    protected $appends  = [];

    protected static function booted() {
        parent::booted();
        static::updating(fn () => throw new LogicException('Audit entries are append-only.'));
        static::deleting(fn () => throw new LogicException('Audit entries are append-only.'));
    }
    public static function record(Model $subject, string $action, ?Authenticatable $actor, array $payload = []): self {
        return static::create([
            'subject_type' => $subject::class,
            'subject_id'   => $subject->getKey(),
            'action'       => $action,
            'actor_id'     => $actor?->getAuthIdentifier(),
            'actor_type'   => match (true) {
                $actor === null         => 'system',
                $actor instanceof User  => 'user',
                default                 => 'machine',
            },
            'payload'      => $payload ?: null,
        ]);
    }
}
