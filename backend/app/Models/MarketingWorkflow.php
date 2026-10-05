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

    /**
     * @deprecated No longer used. Prospects now initialize activities from initiative activities via MarketingProspect::initializeWorkflowActivities()
     */
    public function createProspectActivities(MarketingProspect $prospect): void {
        $activities = $this->orderedActivities()->get();
        $baseDate   = $prospect->created_at;

        $sortedActivities = $this->topologicalSort($activities);

        $createdActivities = [];
        foreach ($sortedActivities as $activity) {
            if ($activity->parent_activity_id && isset($createdActivities[$activity->parent_activity_id])) {
                $parentScheduledAt = $createdActivities[$activity->parent_activity_id];
                $scheduledAt       = $parentScheduledAt->copy()->addDays($activity->day_offset);
            } else {
                $scheduledAt = $baseDate->copy()->addDays($activity->day_offset - 1);
            }

            $prospectActivity = MarketingProspectActivity::create([
                'marketing_prospect_id' => $prospect->id,
                'marketing_activity_id' => $activity->id,
                'scheduled_at'          => $scheduledAt,
                'status'                => 'pending',
            ]);

            $createdActivities[$activity->id] = $scheduledAt;
        }
    }

    private function topologicalSort($activities): array {
        $sorted         = [];
        $visited        = [];
        $activitiesById = [];

        foreach ($activities as $activity) {
            $activitiesById[$activity->id] = $activity;
        }

        $visit = function ($activity) use (&$visit, &$sorted, &$visited, $activitiesById) {
            if (isset($visited[$activity->id])) {
                return;
            }

            $visited[$activity->id] = true;

            if ($activity->parent_activity_id && isset($activitiesById[$activity->parent_activity_id])) {
                $visit($activitiesById[$activity->parent_activity_id]);
            }

            $sorted[] = $activity;
        };

        foreach ($activities as $activity) {
            $visit($activity);
        }
        return $sorted;
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
