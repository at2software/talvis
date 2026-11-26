<?php

namespace App\Services;

use App\Models\MarketingActivity;
use App\Models\MarketingInitiativeActivity;
use App\Models\MarketingProspect;
use App\Models\MarketingProspectActivity;
use App\Models\MarketingWorkflow;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MarketingWorkflowService {
    public static function getWorkflows(Request $request) {
        $query = MarketingWorkflow::with(['marketingInitiatives', 'marketingActivities.performanceMetrics']);

        if ($request->has('marketing_initiative_id')) {
            $query->whereHas('marketingInitiatives', fn ($q) => $q->where('marketing_initiatives.id', $request->marketing_initiative_id));
        }

        if ($request->has('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $workflows = $query->latest()->get();

        $workflows->each(function ($workflow) {
            $activityIds               = $workflow->marketingActivities->pluck('id')->toArray();
            $workflow->stats           = self::calculateActivityStats($activityIds);
            $workflow->prospects_count = MarketingProspect::whereHas('marketingInitiative', function ($q) use ($workflow) {
                $q->whereHas('workflows', fn ($wq) => $wq->where('marketing_workflows.id', $workflow->id));
            })->count();
        });
        return $workflows;
    }
    public static function calculateActivityStats(array $activityIds): array {
        if (empty($activityIds)) {
            return [
                'total'                => 0,
                'pending'              => 0,
                'overdue'              => 0,
                'completed'            => 0,
                'skipped'              => 0,
                'pending_percentage'   => 0,
                'overdue_percentage'   => 0,
                'completed_percentage' => 0,
                'skipped_percentage'   => 0,
            ];
        }

        $initiativeActivityIds = MarketingInitiativeActivity::whereIn('marketing_workflow_id', function ($query) use ($activityIds) {
            $query->select('marketing_workflow_id')
                ->from('marketing_activities')
                ->whereIn('id', $activityIds)
                ->distinct();
        })
            ->whereIn('id', function ($query) use ($activityIds) {
                $query->select('mia.id')
                    ->from('marketing_initiative_activities as mia')
                    ->join('marketing_activities as ma', function ($join) use ($activityIds) {
                        $join->on('mia.marketing_workflow_id', '=', 'ma.marketing_workflow_id')
                            ->on('mia.name', '=', 'ma.name')
                            ->on('mia.day_offset', '=', 'ma.day_offset')
                            ->whereIn('ma.id', $activityIds);
                    });
            })
            ->pluck('id')
            ->toArray();

        if (empty($initiativeActivityIds)) {
            return [
                'total'                => 0,
                'pending'              => 0,
                'overdue'              => 0,
                'completed'            => 0,
                'skipped'              => 0,
                'pending_percentage'   => 0,
                'overdue_percentage'   => 0,
                'completed_percentage' => 0,
                'skipped_percentage'   => 0,
            ];
        }

        $stats = DB::table('marketing_prospect_activities')
            ->whereIn('marketing_initiative_activity_id', $initiativeActivityIds)
            ->selectRaw('
                status,
                COUNT(*) as count,
                SUM(CASE WHEN status = "pending" AND scheduled_at < NOW() THEN 1 ELSE 0 END) as overdue_count
            ')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $total     = $stats->sum('count');
        $overdue   = $stats->sum('overdue_count');
        $pending   = ($stats->get('pending')?->count ?? 0) - $overdue;
        $completed = $stats->get('completed')?->count ?? 0;
        $skipped   = $stats->get('skipped')?->count ?? 0;
        return [
            'total'                => $total,
            'pending'              => $pending,
            'overdue'              => $overdue,
            'completed'            => $completed,
            'skipped'              => $skipped,
            'pending_percentage'   => $total > 0 ? round(($pending / $total) * 100, 1) : 0,
            'overdue_percentage'   => $total > 0 ? round(($overdue / $total) * 100, 1) : 0,
            'completed_percentage' => $total > 0 ? round(($completed / $total) * 100, 1) : 0,
            'skipped_percentage'   => $total > 0 ? round(($skipped / $total) * 100, 1) : 0,
        ];
    }
    public static function getWorkflowWithStats(MarketingWorkflow $workflow) {
        $workflow->load([
            'marketingInitiatives',
            'marketingActivities.performanceMetrics',
            'marketingActivities.i18n',
            'orderedActivities',
        ]);

        $workflow->marketingActivities->each(function ($activity) {
            $activity->setAttribute('stats', self::calculateActivityStats([$activity->id]));
        });

        $prospectStats = MarketingProspect::whereHas('marketingInitiative', function ($q) use ($workflow) {
            $q->whereHas('workflows', fn ($wq) => $wq->where('marketing_workflows.id', $workflow->id));
        })
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status')
            ->toArray();

        $workflow->prospect_stats = [
            'new'          => $prospectStats['new'] ?? 0,
            'engaged'      => $prospectStats['engaged'] ?? 0,
            'unresponsive' => $prospectStats['unresponsive'] ?? 0,
            'converted'    => $prospectStats['converted'] ?? 0,
            'disqualified' => $prospectStats['disqualified'] ?? 0,
            'on_hold'      => $prospectStats['on_hold'] ?? 0,
            'total'        => array_sum($prospectStats),
        ];
        return $workflow;
    }
    public static function createWorkflow(array $validated): MarketingWorkflow {
        $workflow = MarketingWorkflow::create([
            'name'        => $validated['name'],
            'description' => $validated['description'] ?? null,
            'is_active'   => $validated['is_active'] ?? true,
        ]);

        if (isset($validated['activities'])) {
            foreach ($validated['activities'] as $activityData) {
                $activity = $workflow->marketingActivities()->create([
                    'day_offset'  => $activityData['day_offset'],
                    'description' => $activityData['description'] ?? '',
                    'is_required' => $activityData['is_required'] ?? true,
                ]);

                if (isset($activityData['metric_ids'])) {
                    $activity->performanceMetrics()->attach($activityData['metric_ids']);
                }
            }
        }
        return $workflow->load(['marketingActivities.performanceMetrics', 'marketingInitiatives']);
    }
    public static function canDeleteWorkflow(MarketingWorkflow $workflow): ?string {
        $hasActivities = MarketingProspectActivity::whereHas('marketingActivity', fn ($q) => $q->where('marketing_workflow_id', $workflow->id))->exists();

        if ($hasActivities) {
            return 'Cannot delete workflow with existing prospect activities';
        }
        return null;
    }
    public static function getWorkflowActivities(MarketingWorkflow $workflow) {
        $activities = $workflow->marketingActivities()
            ->with('performanceMetrics')
            ->orderBy('day_offset')
            ->get();

        $activities->each(function ($activity) {
            $activity->setAttribute('stats', self::calculateActivityStats([$activity->id]));
        });
        return $activities;
    }
    public static function createWorkflowActivity(MarketingWorkflow $workflow, array $validated): MarketingActivity {
        $activity = $workflow->marketingActivities()->create([
            'name'                    => $validated['name'],
            'day_offset'              => $validated['day_offset'],
            'description'             => $validated['description'] ?? '',
            'is_required'             => $validated['is_required'] ?? true,
            'has_external_dependency' => $validated['has_external_dependency'] ?? false,
            'parent_activity_id'      => $validated['parent_activity_id'] ?? null,
            'is_shared'               => $validated['is_shared'] ?? false,
        ]);

        if (isset($validated['metric_ids'])) {
            $activity->performanceMetrics()->attach($validated['metric_ids']);
        }
        return $activity->load(['performanceMetrics', 'parentActivity', 'childActivities']);
    }
    public static function deleteWorkflowActivity(MarketingActivity $activity): void {
        MarketingActivity::where('parent_activity_id', $activity->id)
            ->update(['parent_activity_id' => $activity->parent_activity_id]);

        $activity->delete();
    }
}
