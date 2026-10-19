<?php

namespace App\Flow\Models;

use App\Models\BaseModel;
use App\Models\Focus;
use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Job extends BaseModel {
    public const OPEN          = 'open';
    public const CLAIMED       = 'claimed';
    public const RUNNING       = 'running';
    public const AWAITING_GATE = 'awaiting_gate';
    public const IN_REVIEW     = 'in_review';
    public const COMPLETED     = 'completed';
    public const FAILED        = 'failed';
    public const REJECTED      = 'rejected';
    public const STATES        = [self::OPEN, self::CLAIMED, self::RUNNING, self::AWAITING_GATE, self::IN_REVIEW, self::COMPLETED, self::FAILED, self::REJECTED];
    public const HELD_BY_CLAIM = [self::CLAIMED, self::RUNNING];

    protected $table    = 'flow_jobs';
    protected $fillable = ['project_id', 'type', 'state', 'input', 'output', 'claimed_by', 'claimed_at', 'metrics', 'knowledge', 'created_by_id'];
    protected $casts    = ['input' => 'array', 'output' => 'array', 'metrics' => 'array', 'knowledge' => 'array', 'claimed_at' => 'datetime', 'project_id' => 'integer'];
    protected $appends  = ['class'];

    public function project(): BelongsTo {
        return $this->belongsTo(Project::class);
    }
    public function jobType(): BelongsTo {
        return $this->belongsTo(JobType::class, 'type', 'key');
    }
    public function createdBy(): BelongsTo {
        return $this->belongsTo(User::class, 'created_by_id');
    }
    public function approvals(): HasMany {
        return $this->hasManyMorph(Approval::class, 'subject')->orderBy('id');
    }
    public function foci(): HasMany {
        return $this->hasManyMorph(Focus::class);
    }
    public function auditEntries(): HasMany {
        return $this->hasManyMorph(AuditEntry::class, 'subject')->orderBy('id');
    }
    public function lastEvent(): HasOne {
        return $this->hasOne(AuditEntry::class, 'subject_id')->where('subject_type', self::class)->latestOfMany();
    }
    public function scopeWithProjectSummary(Builder $query): Builder {
        return $query->with(['project' => fn ($q) => $q->withoutEagerLoads()->select('id', 'name')]);
    }
    public function scopeInState(Builder $query, string $state): Builder {
        return $query->where('state', $state);
    }
    public function isClaimedBy(?string $tokenName): bool {
        return $tokenName !== null && $this->claimed_by === $tokenName;
    }
    public function flowLabel(): string {
        return ($this->jobType?->name ?? $this->type).' #'.$this->id.' — '.$this->project?->name;
    }
    public function flowLink(): string {
        return "/projects/{$this->project_id}/flow";
    }
}
