<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class MarketingPerformanceMetric extends BaseModel {
    protected $table    = 'marketing_performance_metrics';
    protected $fillable = [
        'name',
        'description',
        'metric_type',
        'target_value',
        'kpi_icon',
        'kpi_color',
        'related_metric_id',
    ];

    protected function casts(): array {
        return [
            'target_value' => 'decimal:2',
        ];
    }
    public function marketingInitiatives(): BelongsToMany {
        return $this->belongsToMany(MarketingInitiative::class, 'marketing_initiative_metric')
            ->withPivot(['target_value'])
            ->withTimestamps();
    }
    public function marketingActivities(): BelongsToMany {
        return $this->belongsToMany(MarketingActivity::class, 'marketing_activity_metric')
            ->withPivot(['target_value'])
            ->withTimestamps();
    }
    public function initiativeActivities(): BelongsToMany {
        return $this->belongsToMany(MarketingInitiativeActivity::class, 'marketing_initiative_activity_metric',
            'marketing_performance_metric_id', 'marketing_initiative_activity_id')
            ->withPivot(['target_value'])
            ->withTimestamps();
    }
    public function relatedMetric(): BelongsTo {
        return $this->belongsTo(MarketingPerformanceMetric::class, 'related_metric_id');
    }
    public function prospectActivities() {
        return MarketingProspectActivity::whereIn(
            'marketing_initiative_activity_id',
            $this->initiativeActivities()->select('marketing_initiative_activities.id')
        );
    }
    public function scopeByType($query, string $type) {
        return $query->where('metric_type', $type);
    }
    public function getCurrentValue(): float {
        $query = $this->prospectActivities();

        if ($this->metric_type === 'percentage') {
            $completed = (clone $query)->where('status', 'completed')->count();
            if ($this->related_metric_id && $this->relatedMetric) {
                $relatedCompleted = (clone $this->relatedMetric->prospectActivities())->where('status', 'completed')->count();
                if ($relatedCompleted === 0) {
                    return 0.0;
                }
                return round(($completed / $relatedCompleted) * 100, 2);
            }
            $total = (clone $query)->count();
            if ($total === 0) {
                return 0.0;
            }
            return round(($completed / $total) * 100, 2);
        }

        $bumps     = (clone $query)->sum('bumps');
        $completed = (clone $query)->where('status', 'completed')->count();
        return (float)($bumps + $completed);
    }
    public function getProgressPercentage(): float {
        if (! $this->target_value || $this->target_value == 0) {
            return 0;
        }
        return min(100, ($this->getCurrentValue() / $this->target_value) * 100);
    }
    public function isTargetMet(): bool {
        if (! $this->target_value) {
            return false;
        }
        return $this->getCurrentValue() >= $this->target_value;
    }
    public function getActivityStatistics(): array {
        $baseQuery = $this->prospectActivities();

        $total     = (clone $baseQuery)->count();
        $completed = (clone $baseQuery)->where('status', 'completed')->count();
        $skipped   = (clone $baseQuery)->where('status', 'skipped')->count();
        $overdue   = (clone $baseQuery)->where('status', 'pending')->where('scheduled_at', '<', now())->count();
        $pending   = (clone $baseQuery)->where('status', 'pending')->count() - $overdue;
        return [
            'total'     => $total,
            'completed' => $completed,
            'skipped'   => $skipped,
            'pending'   => $pending,
            'overdue'   => $overdue,
        ];
    }
}
