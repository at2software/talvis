<?php

namespace App\Flow\Models;

use App\Models\BaseModel;
use App\Models\ProjectState;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Transition extends BaseModel {
    protected $table    = 'flow_transitions';
    protected $fillable = ['from_state_id', 'to_state_id', 'required_role', 'active'];
    protected $casts    = ['active' => 'boolean'];
    protected $appends  = [];

    public function fromState(): BelongsTo {
        return $this->belongsTo(ProjectState::class, 'from_state_id');
    }
    public function toState(): BelongsTo {
        return $this->belongsTo(ProjectState::class, 'to_state_id');
    }
    public function scopeActive(Builder $query): Builder {
        return $query->where('active', true);
    }
    public static function between(int $fromStateId, int $toStateId): ?self {
        return static::active()->where('from_state_id', $fromStateId)->where('to_state_id', $toStateId)->first();
    }
    public function allows(User $user): bool {
        return $this->required_role === null || $user->hasAnyRole([$this->required_role]);
    }
}
