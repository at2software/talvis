<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MarketingInitiative extends BaseModel {
    protected $table    = 'marketing_initiatives';
    protected $fillable = [
        'name',
        'parent_id',
        'description',
        'status',
        'start_date',
        'end_date',
    ];

    protected function casts(): array {
        return [
            'start_date' => 'date',
            'end_date'   => 'date',
        ];
    }
    public function parent(): BelongsTo {
        return $this->belongsTo(MarketingInitiative::class, 'parent_id');
    }
    public function children(): HasMany {
        return $this->hasMany(MarketingInitiative::class, 'parent_id');
    }
    public function allChildren(): HasMany {
        return $this->children()->with('allChildren');
    }
    public function channels(): BelongsToMany {
        return $this->belongsToMany(LeadSource::class, 'marketing_initiative_channels', 'marketing_initiative_id', 'lead_source_id')
            ->withPivot(['is_primary', 'custom_settings'])
            ->withTimestamps();
    }
    public function primaryChannel(): BelongsToMany {
        return $this->channels()->wherePivot('is_primary', true);
    }
    public function performanceMetrics(): BelongsToMany {
        return $this->belongsToMany(MarketingPerformanceMetric::class, 'marketing_initiative_metric')
            ->withPivot(['target_value'])
            ->withTimestamps();
    }
    public function workflows(): BelongsToMany {
        return $this->belongsToMany(MarketingWorkflow::class, 'marketing_initiative_workflow')
            ->withPivot(['is_active'])
            ->withTimestamps();
    }
    public function activeWorkflows(): BelongsToMany {
        return $this->workflows()->wherePivot('is_active', true);
    }
    public function prospects(): HasMany {
        return $this->hasMany(MarketingProspect::class);
    }
    public function initiativeActivities(): HasMany {
        return $this->hasMany(MarketingInitiativeActivity::class, 'marketing_initiative_id');
    }
    public function orderedInitiativeActivities(): HasMany {
        return $this->initiativeActivities()->orderBy('day_offset');
    }
    public function users(): BelongsToMany {
        return $this->belongsToMany(User::class, 'marketing_initiative_user')
            ->withPivot(['role', 'receives_notifications'])
            ->withTimestamps();
    }
    public function owners(): BelongsToMany {
        return $this->users()->wherePivot('role', 'owner');
    }
    public function members(): BelongsToMany {
        return $this->users()->wherePivot('role', 'member');
    }
    public function scopeActive($query) {
        return $query->where('status', 'active');
    }
    public function scopeRootInitiatives($query) {
        return $query->whereNull('parent_id');
    }
    public function isActive(): bool {
        return $this->status === 'active';
    }
    public function getAllMetrics() {
        $metrics = $this->performanceMetrics()->withPivot(['target_value'])->get();

        $workflowMetrics = MarketingPerformanceMetric::whereHas('marketingActivities', function ($query) {
            $query->whereHas('marketingWorkflow', function ($q) {
                $q->whereHas('marketingInitiatives', function ($qi) {
                    $qi->where('marketing_initiatives.id', $this->id);
                });
            });
        })->get();

        return $metrics->merge($workflowMetrics)->unique('id')->map(function ($metric) {
            $initiativeActivityIds = MarketingInitiativeActivity::where('marketing_initiative_id', $this->id)
                ->whereIn('marketing_workflow_id', function ($query) use ($metric) {
                    $query->select('marketing_workflow_id')
                        ->from('marketing_activities')
                        ->whereIn('id', function ($subQuery) use ($metric) {
                            $subQuery->select('marketing_activity_id')
                                ->from('marketing_activity_metric')
                                ->where('marketing_performance_metric_id', $metric->id);
                        });
                })
                ->pluck('id');

            $baseQuery = MarketingProspectActivity::whereHas('marketingProspect', function ($q) {
                $q->where('marketing_initiative_id', $this->id);
            })->whereIn('marketing_initiative_activity_id', $initiativeActivityIds);

            $total     = (clone $baseQuery)->count();
            $completed = (clone $baseQuery)->where('status', 'completed')->count();
            $skipped   = (clone $baseQuery)->where('status', 'skipped')->count();
            $overdue   = (clone $baseQuery)->where('status', 'pending')->where('scheduled_at', '<', now())->count();
            $pending   = (clone $baseQuery)->where('status', 'pending')->count() - $overdue;

            $metric->activity_stats = [
                'total'     => $total,
                'completed' => $completed,
                'skipped'   => $skipped,
                'pending'   => $pending,
                'overdue'   => $overdue,
            ];

            $metric->current_value = $completed;
            return $metric;
        });
    }
    public function getProspectsCountByStatus(): array {
        return $this->prospects()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status')
            ->toArray();
    }
    public static function createWithUser(array $validated, $user = null): static {
        $initiative = static::create($validated);

        if ($user) {
            $initiative->users()->attach($user->id, ['role' => 'owner']);
        }

        if (isset($validated['channels'])) {
            foreach ($validated['channels'] as $channel) {
                $initiative->channels()->attach($channel['lead_source_id'], [
                    'is_primary'      => $channel['is_primary'] ?? false,
                    'custom_settings' => $channel['custom_settings'] ?? null,
                ]);
            }
        }
        return $initiative->load(['channels', 'parent', 'users']);
    }
    public function getDeletionBlocker(): ?string {
        if ($this->children()->exists()) {
            return 'Cannot delete initiative with sub-initiatives';
        }
        if ($this->prospects()->exists()) {
            return 'Cannot delete initiative with prospects';
        }
        return null;
    }
    public function addChannel(array $validated) {
        if ($this->channels()->where('lead_source_id', $validated['lead_source_id'])->exists()) {
            return null;
        }
        $this->channels()->attach($validated['lead_source_id'], [
            'is_primary'      => $validated['is_primary'] ?? false,
            'custom_settings' => $validated['custom_settings'] ?? null,
        ]);
        return $this->channels()->withPivot(['is_primary', 'custom_settings'])->get();
    }
    public function removeChannel(LeadSource $leadSource): ?array {
        if (! $this->channels()->where('lead_source_id', $leadSource->id)->exists()) {
            return null;
        }
        $this->channels()->detach($leadSource->id);
        return [
            'message'  => 'Channel removed successfully',
            'channels' => $this->channels()->withPivot(['is_primary', 'custom_settings'])->get(),
        ];
    }
    public function updateChannels(array $channels) {
        $syncData = [];
        foreach ($channels as $channel) {
            $syncData[$channel['lead_source_id']] = [
                'is_primary'      => $channel['is_primary'] ?? false,
                'custom_settings' => $channel['custom_settings'] ?? null,
            ];
        }
        $this->channels()->sync($syncData);
        return $this->channels()->withPivot(['is_primary', 'custom_settings'])->get();
    }
    public function copyWorkflowActivities(MarketingWorkflow $workflow): void {
        $activityIdMap = [];

        foreach ($workflow->orderedActivities()->with('i18n')->get() as $activity) {
            $newActivity = MarketingInitiativeActivity::create([
                'marketing_initiative_id' => $this->id,
                'marketing_workflow_id'   => $workflow->id,
                'name'                    => $activity->name,
                'day_offset'              => $activity->day_offset,
                'description'             => $activity->description,
                'is_required'             => $activity->is_required,
                'has_external_dependency' => $activity->has_external_dependency ?? false,
                'quick_action'            => $activity->quick_action,
                'parent_activity_id'      => null,
            ]);
            $activityIdMap[$activity->id] = $newActivity->id;
        }

        foreach ($workflow->orderedActivities as $activity) {
            if ($activity->parent_activity_id && isset($activityIdMap[$activity->parent_activity_id])) {
                MarketingInitiativeActivity::where('id', $activityIdMap[$activity->id])
                    ->update(['parent_activity_id' => $activityIdMap[$activity->parent_activity_id]]);
            }
        }
    }
    public function createActivity(array $validated): MarketingInitiativeActivity {
        $activity = $this->marketingInitiativeActivities()->create([
            'marketing_workflow_id'   => $validated['marketing_workflow_id'] ?? null,
            'name'                    => $validated['name'],
            'day_offset'              => $validated['day_offset'],
            'description'             => $validated['description'] ?? '',
            'is_required'             => $validated['is_required'] ?? true,
            'has_external_dependency' => $validated['has_external_dependency'] ?? false,
            'parent_activity_id'      => $validated['parent_activity_id'] ?? null,
            'quick_action'            => $validated['quick_action'] ?? null,
        ]);

        if (isset($validated['metric_ids'])) {
            $activity->performanceMetrics()->attach($validated['metric_ids']);
        }
        return $activity->load(['performanceMetrics', 'parentActivity', 'childActivities', 'i18n']);
    }
    public static function filteredQuery(Request $request) {
        $query = static::with(['parent', 'children', 'channels', 'performanceMetrics', 'workflows', 'users'])
            ->withCount('prospects')
            ->withCount(['prospects as overdue_prospects_count' => function ($query) {
                $query->whereNotIn('status', ['unresponsive', 'disqualified', 'on_hold'])
                    ->where('user_id', auth()->id())
                    ->whereHas('activities', function ($q) {
                        $q->where('status', 'pending')->where('scheduled_at', '<=', now());
                    });
            }]);

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        if ($request->boolean('root_only')) {
            $query->whereNull('parent_id');
        }
        if ($request->has('search')) {
            $query->where('name', 'like', '%'.$request->search.'%');
        }
        if ($request->has('company_id')) {
            $companyId = $request->company_id;
            $query->whereHas('prospects', function ($q) use ($companyId) {
                $q->whereHas('companyContact', function ($q2) use ($companyId) {
                    $q2->where('company_id', $companyId);
                });
            })->withCount(['prospects as company_prospects_count' => function ($q) use ($companyId) {
                $q->whereHas('companyContact', function ($q2) use ($companyId) {
                    $q2->where('company_id', $companyId);
                });
            }]);
        }
        return $query->latest()->paginate(50)->withQueryString();
    }
    public function getInitiativeStats(): array {
        $timeline  = [];
        $startDate = now()->subDays(30)->startOfDay();

        for ($i = 0; $i <= 30; $i++) {
            $date    = $startDate->copy()->addDays($i);
            $dateStr = $date->format('Y-m-d');

            $timeline[] = [
                'date'      => $dateStr,
                'timestamp' => $date->timestamp * 1000,
                'new'       => $this->prospects()
                    ->where('status', 'new')
                    ->where('created_at', '<=', $date->endOfDay())
                    ->count(),
                'engaged' => $this->prospects()
                    ->where('status', 'engaged')
                    ->where('created_at', '<=', $date->endOfDay())
                    ->count(),
                'unresponsive' => $this->prospects()
                    ->where('status', 'unresponsive')
                    ->where('created_at', '<=', $date->endOfDay())
                    ->count(),
                'converted' => $this->prospects()
                    ->where('status', 'converted')
                    ->where('created_at', '<=', $date->endOfDay())
                    ->count(),
            ];
        }

        $initiativeActivityIds = $this->initiativeActivities()->pluck('id')->toArray();
        $perActivityStats      = DB::table('marketing_prospect_activities')
            ->whereIn('marketing_initiative_activity_id', $initiativeActivityIds)
            ->selectRaw('marketing_initiative_activity_id,
                COUNT(*) as total,
                SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = "skipped" THEN 1 ELSE 0 END) as skipped,
                SUM(CASE WHEN status = "pending" AND scheduled_at < NOW() THEN 1 ELSE 0 END) as overdue,
                SUM(CASE WHEN status = "pending" AND (scheduled_at IS NULL OR scheduled_at >= NOW()) THEN 1 ELSE 0 END) as pending')
            ->groupBy('marketing_initiative_activity_id')
            ->get()
            ->keyBy('marketing_initiative_activity_id');

        return [
            'prospects' => [
                'total'     => $this->prospects()->count(),
                'by_status' => $this->getProspectsCountByStatus(),
                'recent'    => $this->prospects()->where('created_at', '>=', now()->subDays(7))->count(),
            ],
            'activities' => $perActivityStats,
            'metrics'    => $this->performanceMetrics->map(fn ($metric) => [
                'id'                  => $metric->id,
                'name'                => $metric->name,
                'type'                => $metric->metric_type,
                'current_value'       => $metric->getCurrentValue(),
                'target_value'        => $metric->target_value,
                'progress_percentage' => $metric->getProgressPercentage(),
            ]),
            'timeline' => $timeline,
        ];
    }
}
