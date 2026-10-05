<?php

namespace App\Models;

use App\Casts\I18n;
use App\Traits\HasI18nTrait;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingInitiativeActivity extends BaseModel {
    use HasI18nTrait;

    protected $table    = 'marketing_initiative_activities';
    protected $fillable = [
        'marketing_initiative_id',
        'marketing_workflow_id',
        'name',
        'day_offset',
        'description',
        'is_required',
        'has_external_dependency',
        'parent_activity_id',
        'quick_action',
    ];

    protected function casts(): array {
        return [
            'day_offset'              => 'integer',
            'is_required'             => 'boolean',
            'has_external_dependency' => 'boolean',
            'description'             => I18n::class,
        ];
    }
    public function marketingInitiative(): BelongsTo {
        return $this->belongsTo(MarketingInitiative::class, 'marketing_initiative_id');
    }
    public function marketingWorkflow(): BelongsTo {
        return $this->belongsTo(MarketingWorkflow::class, 'marketing_workflow_id');
    }
    public function marketingProspectActivities(): HasMany {
        return $this->hasMany(MarketingProspectActivity::class, 'marketing_initiative_activity_id');
    }
    public function completedActivities(): HasMany {
        return $this->marketingProspectActivities()->where('status', 'completed');
    }
    public function parentActivity(): BelongsTo {
        return $this->belongsTo(MarketingInitiativeActivity::class, 'parent_activity_id');
    }
    public function childActivities(): HasMany {
        return $this->hasMany(MarketingInitiativeActivity::class, 'parent_activity_id');
    }
    public function performanceMetrics(): BelongsToMany {
        return $this->belongsToMany(
            MarketingPerformanceMetric::class,
            'marketing_initiative_activity_metric',
            'marketing_initiative_activity_id',
            'marketing_performance_metric_id'
        )
            ->withPivot(['target_value'])
            ->withTimestamps();
    }
    public function scopeRequired($query) {
        return $query->where('is_required', true);
    }
    public function scopeForDay($query, int $day) {
        return $query->where('day_offset', $day);
    }
    public function scopeOrderedByDay($query) {
        return $query->orderBy('day_offset');
    }
    public function getCompletionRate(): float {
        $total = $this->marketingProspectActivities()->count();

        if ($total === 0) {
            return 0;
        }

        $completed = $this->completedActivities()->count();
        return ($completed / $total) * 100;
    }
    public function isOverdue(): bool {
        return $this->marketingProspectActivities()
            ->where('status', 'pending')
            ->where('scheduled_at', '<', now())
            ->exists();
    }
    public function updateWithRelations(array $validated): static {
        $this->update($validated);
        return $this->load(['performanceMetrics', 'parentActivity', 'childActivities', 'i18n']);
    }
    public function deleteWithReparent(): void {
        static::where('parent_activity_id', $this->id)
            ->update(['parent_activity_id' => $this->parent_activity_id]);
        $this->delete();
    }
}
