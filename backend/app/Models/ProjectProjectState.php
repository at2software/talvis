<?php

namespace App\Models;

use App\Enums\SentinelTriggerType;
use App\Services\SentinelTriggerService;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

class ProjectProjectState extends Pivot {
    protected $table     = 'project_project_state';
    public $incrementing = true;
    protected $fillable  = ['project_id', 'project_state_id', 'user_id', 'reason'];

    protected static function booted() {
        static::created(function ($model) {
            SentinelTriggerService::handleModelBasedTrigger(SentinelTriggerType::OnCreated, $model);
        });

        static::updated(function ($model) {
            SentinelTriggerService::handleModelBasedTrigger(SentinelTriggerType::OnUpdated, $model);
        });

        static::deleted(function ($model) {
            SentinelTriggerService::handleModelBasedTrigger(SentinelTriggerType::OnDeleted, $model);
        });
    }
    public function project(): BelongsTo {
        return $this->belongsTo(Project::class);
    }
    public function projectState(): BelongsTo {
        return $this->belongsTo(ProjectState::class);
    }
}
