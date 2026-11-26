<?php

namespace App\Models;

use App\Traits\CustomModelTrait;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class UptimeMonitor extends BaseModel {
    use CustomModelTrait;
    use HasFactory;

    protected $appends  = ['icon', 'class', 'path'];
    protected $fillable = [
        'name',
        'url',
        'method',
        'expected_status_code',
        'timeout',
        'response_time_threshold',
        'check_interval',
        'is_active',
        'request_headers',
        'request_body',
        'last_check_at',
        'last_status',
        'last_notified_at',
        'created_by_user_id',
        'skip_ssl_verification',
    ];

    protected function casts(): array {
        return [
            'request_headers'       => 'array',
            'is_active'             => 'boolean',
            'skip_ssl_verification' => 'boolean',
            'last_check_at'         => 'datetime',
            'last_notified_at'      => 'datetime',
            'created_at'            => 'datetime',
            'updated_at'            => 'datetime',
        ];
    }
    public function getIconAttribute(): string {
        return match ($this->last_status) {
            'up'       => 'check_circle',
            'down'     => 'cancel',
            'degraded' => 'warning',
            default    => 'radio_button_unchecked',
        };
    }
    public function createdBy() {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
    public function projects() {
        return $this->belongsToMany(Project::class, 'project_uptime_monitor')
            ->withTimestamps();
    }
    public function checks() {
        return $this->hasMany(UptimeCheck::class)->orderBy('checked_at', 'desc');
    }
    public function latestCheck() {
        return $this->hasOne(UptimeCheck::class)->latestOfMany('checked_at');
    }
    public function recipients() {
        return $this->belongsToMany(User::class, 'uptime_monitor_user')
            ->withPivot(['notify_via_email', 'notify_via_chat', 'notify_on_recovery'])
            ->withTimestamps();
    }
    public function uptimePercentageSince(?Carbon $since = null): float {
        $checks      = fn () => $this->checks()->when($since, fn ($q) => $q->where('checked_at', '>=', $since));
        $totalChecks = $checks()->count();
        if ($totalChecks === 0) {
            return 100.0;
        }

        $successfulChecks = $checks()->where('status', 'up')->count();
        return round(($successfulChecks / $totalChecks) * 100, 2);
    }
    public function getUptimePercentageAttribute(): float {
        return $this->uptimePercentageSince();
    }
    public function getAverageResponseTimeAttribute(): ?float {
        $average = $this->checks()
            ->where('status', 'up')
            ->whereNotNull('response_time')
            ->avg('response_time');
        return $average ? round($average) : null;
    }
}
