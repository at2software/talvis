<?php

namespace App\Flow\Models;

use App\Models\BaseModel;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Approval extends BaseModel {
    public const PENDING           = 'pending';
    public const APPROVED          = 'approved';
    public const REJECTED          = 'rejected';
    public const CHANGES_REQUESTED = 'changes_requested';
    public const WITHDRAWN         = 'withdrawn';

    protected $table    = 'flow_approvals';
    protected $fillable = ['subject_type', 'subject_id', 'gate_key', 'requested_by_id', 'required_role', 'required_approvals', 'decision', 'decided_by_id', 'decided_at', 'reason', 'context', 'selected_option'];
    protected $casts    = ['context' => 'array', 'decided_at' => 'datetime', 'required_approvals' => 'integer', 'requested_by_id' => 'integer', 'decided_by_id' => 'integer'];
    protected $appends  = ['class'];

    public function subject(): MorphTo {
        return $this->morphTo();
    }
    public function votes(): HasMany {
        return $this->hasMany(ApprovalVote::class);
    }
    public function requestedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'requested_by_id');
    }
    public function decidedBy(): BelongsTo {
        return $this->belongsTo(User::class, 'decided_by_id');
    }
    public function scopePending(Builder $query): Builder {
        return $query->where('decision', self::PENDING);
    }
    public function scopeApproved(Builder $query): Builder {
        return $query->where('decision', self::APPROVED);
    }
    public function scopeDecidableBy(Builder $query, User $user): Builder {
        return $query->pending()
            ->when(! $user->hasRole('admin'), fn ($q) => $q->whereIn('required_role', $user->getRoleNames()))
            ->where(fn ($q) => $q->whereNull('requested_by_id')->orWhere('requested_by_id', '!=', $user->id))
            ->whereDoesntHave('votes', fn ($q) => $q->where('user_id', $user->id));
    }
    public static function pendingFor(Model $subject, ?string $gateKey = null): ?self {
        return static::pending()
            ->where('subject_type', $subject::class)
            ->where('subject_id', $subject->getKey())
            ->where('gate_key', $gateKey)
            ->latest('id')
            ->first();
    }
    public function isPending(): bool {
        return $this->decision === self::PENDING;
    }
    public function isApproved(): bool {
        return $this->decision === self::APPROVED;
    }
    public function options(): array {
        return $this->context['options'] ?? [];
    }
    public function reviewRound(): ?int {
        return $this->context['review_round'] ?? null;
    }
    public function getSubjectLabelAttribute(): string {
        $subject = $this->subject;
        return match (true) {
            $subject === null                      => class_basename($this->subject_type).' #'.$this->subject_id,
            method_exists($subject, 'flowLabel')   => $subject->flowLabel(),
            filled($subject->getAttribute('name')) => $subject->getAttribute('name'),
            default                                => class_basename($subject).' #'.$subject->getKey(),
        };
    }
    public function getSubjectLinkAttribute(): ?string {
        $subject = $this->subject;
        return match (true) {
            $subject instanceof Project          => "/projects/{$subject->id}",
            method_exists($subject, 'flowLink')  => $subject->flowLink(),
            default                              => null,
        };
    }
}
