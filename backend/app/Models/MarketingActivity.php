<?php

namespace App\Models;

use App\Casts\I18n;
use App\Traits\HasI18nTrait;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketingActivity extends BaseModel {
    use HasI18nTrait;

    protected $table    = 'marketing_activities';
    protected $fillable = [
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
    public function marketingWorkflow(): BelongsTo {
        return $this->belongsTo(MarketingWorkflow::class, 'marketing_workflow_id');
    }
    public function performanceMetrics(): BelongsToMany {
        return $this->belongsToMany(MarketingPerformanceMetric::class, 'marketing_activity_metric')
            ->withPivot(['target_value'])
            ->withTimestamps();
    }
    public function parentActivity(): BelongsTo {
        return $this->belongsTo(MarketingActivity::class, 'parent_activity_id');
    }
    public function childActivities(): HasMany {
        return $this->hasMany(MarketingActivity::class, 'parent_activity_id');
    }
    public function scopeRequired($query) {
        return $query->where('is_required', true);
    }
    public function scopeForDay($query, int $day) {
        return $query->where('day_offset', $day);
    }
}
