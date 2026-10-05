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
    public function marketingProspectActivities(): HasMany {
        return $this->hasMany(MarketingProspectActivity::class, 'marketing_activity_id');
    }
    public function completedActivities(): HasMany {
        return $this->marketingProspectActivities()->where('status', 'completed');
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
    public function scopeByType($query, string $type) {
        return $query->where('activity_type', $type);
    }
    public function scopeForDay($query, int $day) {
        return $query->where('day_offset', $day);
    }
    public function getActivityTypeLabel(): string {
        return match ($this->activity_type) {
            'like_post'          => 'Like Post',
            'send_message'       => 'Send Message',
            'connection_request' => 'Connection Request',
            'call'               => 'Phone Call',
            'email'              => 'Send Email',
            'follow'             => 'Follow Profile',
            'view_profile'       => 'View Profile',
            'comment_post'       => 'Comment on Post',
            'share_post'         => 'Share Post',
            'custom'             => 'Custom Activity',
            default              => ucfirst(str_replace('_', ' ', $this->activity_type))
        };
    }
    public function getCompletionRate(): float {
        $total = $this->marketingProspectActivities()->count();

        if ($total === 0) {
            return 0;
        }

        $completed = $this->completedActivities()->count();
        return ($completed / $total) * 100;
    }
    public function tracksMetric(): bool {
        return ! is_null($this->marketing_performance_metric_id);
    }
    public function getTotalPerformanceValue() {
        if (! $this->tracksMetric()) {
            return 0;
        }
        return $this->completedActivities()->sum('performance_value');
    }
    public function isOverdue(): bool {
        return $this->marketingProspectActivities()
            ->where('status', 'pending')
            ->where('scheduled_at', '<', now())
            ->exists();
    }
}
