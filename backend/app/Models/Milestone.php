<?php

namespace App\Models;

use App\Traits\HasTasksTrait;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

class Milestone extends BaseModel {
    use HasFactory;
    use HasTasksTrait;
    use SoftDeletes;

    protected $touches  = ['project'];
    protected $fillable = [
        'name',
        'comments',
        'due_at',
        'started_at',
        'duration',
        'progress',
        'state',
        'flags',
        'project_id',
        'position',
        'user_id',
        'workload_hours',
        'ext_issue_plugin_link_id',
        'ext_issue_id',
    ];
    protected $appends = ['computed_workload_percent'];
    protected $casts   = [
        'started_at' => 'date',
        'due_at'     => 'date',
    ];

    public function getChildrenAttribute() {
        return $this->dependees()->withPivot(['dependant_id', 'dependee_id'])->get();
    }
    protected function progress(): Attribute {
        return Attribute::make(
            get: function () {
                if (count($this->invoiceItems)) {
                    $totalWorkload = $this->invoiceItems->sum(fn ($_) => $_->assumedWorkload());
                    return $totalWorkload > 0 ? $this->invoiceItems->sum(fn ($_) => $_->foci_sum) / $totalWorkload : 0;
                } else {
                    return $this->attributes['progress'] ?? 0;
                }
            }
        );
    }
    public function project() {
        return $this->belongsTo(Project::class);
    }
    public function user() {
        return $this->belongsTo(User::class);
    }
    public function extIssuePluginLink() {
        return $this->belongsTo(PluginLink::class, 'ext_issue_plugin_link_id');
    }
    public function dependants() {
        return $this->belongsToMany(Milestone::class, 'milestone_milestones', 'dependant_id', 'dependee_id');
    }
    public function dependees() {
        return $this->belongsToMany(Milestone::class, 'milestone_milestones', 'dependee_id', 'dependant_id');
    }
    public function invoiceItems() {
        return $this->belongsToMany(InvoiceItem::class, 'invoice_item_milestone')->withTimestamps();
    }
    public function getComputedWorkloadPercentAttribute(): ?float {
        $totalHours = null;

        if ($this->workload_hours !== null && $this->workload_hours > 0) {
            $totalHours = $this->workload_hours;
        } else {
            if (! $this->relationLoaded('invoiceItems')) {
                $this->load('invoiceItems');
            }

            if ($this->invoiceItems->isNotEmpty()) {
                $totalHours = $this->invoiceItems->sum(fn ($item) => $item->assumedWorkload());
            }
        }

        if ($totalHours === null || $totalHours <= 0) {
            return 0;
        }

        $startedAt   = $this->started_at ? $this->started_at->copy() : now();
        $dueAt       = $this->due_at ? $this->due_at->copy() : now()->addDays(7);
        $workingDays = $this->countWorkingDaysBetween($startedAt, $dueAt);

        if ($workingDays <= 0) {
            return 100.0;
        }

        $dailyHours = $totalHours / $workingDays;

        $user          = $this->user ?? ($this->user_id ? User::find($this->user_id) : null);
        $avgDailyHours = $user ? $user->hpd : 8;

        if ($avgDailyHours <= 0) {
            return 100.0;
        }
        return round(($dailyHours / $avgDailyHours) * 100, 1);
    }
    public function getDailyHours(User $user): float {
        $workloadPercent = $this->computed_workload_percent;
        if ($workloadPercent === null || $workloadPercent === 0) {
            return 0;
        }
        return ($workloadPercent / 100) * $user->hpd;
    }
    private function countWorkingDaysBetween(Carbon $start, Carbon $end): int {
        $workingDays = 0;
        $period      = CarbonPeriod::create($start, $end);

        foreach ($period as $date) {
            $dayOfWeek = $date->dayOfWeekIso;
            if ($dayOfWeek <= 5) {
                $workingDays++;
            }
        }
        return max($workingDays, 1);
    }
}
