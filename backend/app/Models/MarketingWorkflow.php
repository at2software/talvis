<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;

class MarketingWorkflow extends BaseModel {
    protected $table    = 'marketing_workflows';
    protected $fillable = [
        'name',
        'description',
        'is_active',
    ];

    protected function casts(): array {
        return [
            'is_active' => 'boolean',
        ];
    }
    public function marketingInitiatives(): BelongsToMany {
        return $this->belongsToMany(MarketingInitiative::class, 'marketing_initiative_workflow')
            ->withPivot(['is_active'])
            ->withTimestamps();
    }
    public function activeInitiatives(): BelongsToMany {
        return $this->marketingInitiatives()->wherePivot('is_active', true);
    }
    public function marketingActivities(): HasMany {
        return $this->hasMany(MarketingActivity::class, 'marketing_workflow_id');
    }
    public function prospectActivities(): HasManyThrough {
        return $this->hasManyThrough(
            MarketingProspectActivity::class,
            MarketingInitiativeActivity::class,
            'marketing_workflow_id',          // FK on marketing_initiative_activities
            'marketing_initiative_activity_id', // FK on marketing_prospect_activities
            'id',                             // local key on marketing_workflows
            'id'                              // local key on marketing_initiative_activities
        );
    }
    public function orderedActivities(): HasMany {
        return $this->marketingActivities()->orderBy('day_offset');
    }
    public function scopeActive($query) {
        return $query->where('is_active', true);
    }
    public function getTotalDuration(): int {
        return $this->marketingActivities()->max('day_offset') ?: 0;
    }
    public function getActivitiesForDay(int $day): Collection {
        return $this->marketingActivities()
            ->where('day_offset', $day)
            ->orderBy('day_offset')
            ->get();
    }
    public function duplicate(?string $newName = null): self {
        $copy       = $this->replicate();
        $copy->name = $newName ?: ($this->name.' (Copy)');
        $copy->save();

        foreach ($this->marketingActivities as $activity) {
            $activityCopy                        = $activity->replicate();
            $activityCopy->marketing_workflow_id = $copy->id;
            $activityCopy->save();
        }
        return $copy;
    }
}
