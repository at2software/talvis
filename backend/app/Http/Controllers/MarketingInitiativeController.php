<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Traits\MarketingControllerHelpers;
use App\Http\Requests\Marketing\AttachWorkflowRequest;
use App\Http\Requests\Marketing\InitiativeRequest;
use App\Http\Requests\Marketing\StoreInitiativeActivityRequest;
use App\Http\Requests\Marketing\StoreInitiativeChannelRequest;
use App\Http\Requests\Marketing\SubscribeUserRequest;
use App\Http\Requests\Marketing\UpdateInitiativeChannelsRequest;
use App\Http\Requests\Marketing\UpdateTargetValueRequest;
use App\Models\LeadSource;
use App\Models\MarketingInitiative;
use App\Models\MarketingInitiativeActivity;
use App\Models\MarketingPerformanceMetric;
use App\Models\MarketingProspectActivity;
use App\Models\MarketingWorkflow;
use App\Services\MarketingMetricsService;
use Illuminate\Http\Request;

class MarketingInitiativeController extends Controller {
    use MarketingControllerHelpers;

    public function indexInitiatives(Request $request) {
        return MarketingInitiative::filteredQuery($request);
    }
    public function showInitiative(MarketingInitiative $marketingInitiative) {
        $marketingInitiative->load([
            'parent',
            'children.children',
            'channels',
            'workflows.marketingActivities.i18n',
            'initiativeActivities.parentActivity',
            'initiativeActivities.childActivities',
            'initiativeActivities.performanceMetrics',
            'initiativeActivities.i18n',
            'users',
        ]);

        $marketingInitiative->performance_metrics = $marketingInitiative->getAllMetrics();

        return $marketingInitiative;
    }
    public function storeInitiative(InitiativeRequest $request) {
        return MarketingInitiative::createWithUser($request->validated(), $request->user());
    }
    public function updateInitiative(InitiativeRequest $request, MarketingInitiative $marketingInitiative) {
        $marketingInitiative->update($request->validated());

        return $marketingInitiative->load(['channels', 'parent', 'performanceMetrics']);
    }
    public function destroyInitiative(MarketingInitiative $marketingInitiative) {
        $error = $marketingInitiative->getDeletionBlocker();
        if ($error) {
            return response()->json(['error' => $error], 422);
        }

        $marketingInitiative->delete();

        return response()->json(['message' => 'Initiative deleted successfully']);
    }
    public function indexInitiativeChannels(MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->channels()->withPivot(['is_primary', 'custom_settings'])->get();
    }
    public function addInitiativeChannel(StoreInitiativeChannelRequest $request, MarketingInitiative $marketingInitiative) {
        $result = $marketingInitiative->addChannel($request->validated());
        if ($result === null) {
            return response()->json(['error' => 'Channel already added to this initiative'], 422);
        }

        return $result;
    }
    public function removeInitiativeChannel(MarketingInitiative $marketingInitiative, LeadSource $leadSource) {
        $result = $marketingInitiative->removeChannel($leadSource);
        if ($result === null) {
            return response()->json(['error' => 'Channel not found in this initiative'], 404);
        }

        return response()->json($result);
    }
    public function updateInitiativeChannels(UpdateInitiativeChannelsRequest $request, MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->updateChannels($request->validated('channels'));
    }
    public function indexInitiativeWorkflows(MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->workflows()->withPivot(['is_active'])->get();
    }
    public function attachWorkflowToInitiative(AttachWorkflowRequest $request, MarketingInitiative $marketingInitiative) {
        $validated = $request->validated();

        if ($marketingInitiative->workflows()->where('marketing_workflow_id', $validated['marketing_workflow_id'])->exists()) {
            return response()->json(['error' => 'Workflow already attached to this initiative'], 422);
        }

        $marketingInitiative->workflows()->attach($validated['marketing_workflow_id'], [
            'is_active' => $validated['is_active'] ?? true,
        ]);

        $workflow = MarketingWorkflow::with('orderedActivities')->find($validated['marketing_workflow_id']);
        $marketingInitiative->copyWorkflowActivities($workflow);

        return $marketingInitiative->workflows()->withPivot(['is_active'])->get();
    }
    public function detachWorkflowFromInitiative(Request $request, MarketingInitiative $marketingInitiative, MarketingWorkflow $marketingWorkflow) {
        if (! $marketingInitiative->workflows()->where('marketing_workflow_id', $marketingWorkflow->id)->exists()) {
            return response()->json(['error' => 'Workflow not found in this initiative'], 404);
        }

        if ($request->boolean('remove_prospect_activities')) {
            $initiativeActivityIds = $marketingInitiative->initiativeActivities()
                ->where('marketing_workflow_id', $marketingWorkflow->id)
                ->pluck('id');

            MarketingProspectActivity::whereIn('marketing_initiative_activity_id', $initiativeActivityIds)
                ->delete();

            $marketingInitiative->initiativeActivities()
                ->where('marketing_workflow_id', $marketingWorkflow->id)
                ->delete();
        }

        $marketingInitiative->workflows()->detach($marketingWorkflow->id);

        return response()->json([
            'message'   => 'Workflow detached successfully',
            'workflows' => $marketingInitiative->workflows()->withPivot(['is_active'])->get(),
        ]);
    }
    public function subscribeUserToInitiative(SubscribeUserRequest $request, MarketingInitiative $marketingInitiative) {
        $validated = $request->validated();

        if ($marketingInitiative->users()->where('user_id', $validated['user_id'])->exists()) {
            return response()->json(['error' => 'User already subscribed to this initiative'], 422);
        }

        $marketingInitiative->users()->attach($validated['user_id'], [
            'role' => $validated['role'] ?? 'member',
        ]);

        return response()->json([
            'message' => 'User subscribed successfully',
            'users'   => $marketingInitiative->users()->get(),
        ]);
    }
    public function unsubscribeUserFromInitiative(MarketingInitiative $marketingInitiative, $userId) {
        if (! $marketingInitiative->users()->where('user_id', $userId)->exists()) {
            return response()->json(['error' => 'User not subscribed to this initiative'], 404);
        }

        $marketingInitiative->users()->detach($userId);

        return response()->json([
            'message' => 'User unsubscribed successfully',
            'users'   => $marketingInitiative->users()->get(),
        ]);
    }
    public function showInitiativeStats(MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->getInitiativeStats();
    }
    public function indexInitiativeRecentActivity(MarketingInitiative $marketingInitiative) {
        return MarketingProspectActivity::whereHas(
            'marketingInitiativeActivity',
            fn ($q) => $q->where('marketing_initiative_id', $marketingInitiative->id)
        )
            ->where('status', '!=', 'pending')
            ->with(['marketingProspect', 'marketingInitiativeActivity'])
            ->latest('updated_at')
            ->limit(20)
            ->get();
    }
    public function indexInitiativesForAddon(Request $request) {
        return MarketingInitiative::active()
            ->whereHas('users', fn ($q) => $q->where('users.id', $request->user()->id))
            ->with(['workflows.marketingActivities', 'performanceMetrics', 'channels'])
            ->get();
    }
    public function indexInitiativeMetrics(MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->performanceMetrics()
            ->withPivot(['target_value'])
            ->get();
    }
    public function attachInitiativeMetric(Request $request, MarketingInitiative $marketingInitiative) {
        $validated = $request->validate($this->metricAttachRules());

        $result = MarketingMetricsService::attachMetricToInitiative(
            $marketingInitiative,
            $validated['metric_id'],
            $validated['target_value'] ?? null
        );

        if ($result === null) {
            return response()->json(['error' => 'Metric already attached to this initiative'], 409);
        }

        return $result;
    }
    public function updateInitiativeMetric(UpdateTargetValueRequest $request, MarketingInitiative $marketingInitiative, MarketingPerformanceMetric $marketingPerformanceMetric) {
        return MarketingMetricsService::updateInitiativeMetric(
            $marketingInitiative,
            $marketingPerformanceMetric,
            $request->validated('target_value')
        );
    }
    public function detachInitiativeMetric(MarketingInitiative $marketingInitiative, MarketingPerformanceMetric $marketingPerformanceMetric) {
        $marketingInitiative->performanceMetrics()->detach($marketingPerformanceMetric->id);

        return response()->json(['message' => 'Metric detached successfully']);
    }
    public function indexAllInitiativeMetrics(MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->getAllMetrics();
    }
    public function indexInitiativeActivities(MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->initiativeActivities()
            ->with(['performanceMetrics', 'parentActivity', 'childActivities', 'i18n'])
            ->orderedByDay()
            ->get();
    }
    public function storeInitiativeActivity(StoreInitiativeActivityRequest $request, MarketingInitiative $marketingInitiative) {
        return $marketingInitiative->createActivity($request->validated());
    }
    public function updateInitiativeActivity(Request $request, MarketingInitiative $marketingInitiative, MarketingInitiativeActivity $marketingInitiativeActivity) {
        if ($error = $this->assertBelongsTo($marketingInitiativeActivity, 'marketing_initiative_id', $marketingInitiative->id, 'Activity does not belong to this initiative')) {
            return $error;
        }

        $validated = $request->validate($this->activityUpdateRules('marketing_initiative_activities'));

        return $marketingInitiativeActivity->updateWithRelations($validated);
    }
    public function indexSharedActivities(Request $request) {
        return MarketingInitiativeActivity::sharedWithDueCounts($request->user()->id);
    }
    public function completeSharedActivity(Request $request, MarketingInitiativeActivity $marketingInitiativeActivity) {
        if (! $marketingInitiativeActivity->is_shared) {
            return response()->json(['error' => 'Activity is not shared'], 422);
        }
        return ['completed' => $marketingInitiativeActivity->completeDueForAll($request->user()->id)];
    }
    public function destroyInitiativeActivity(MarketingInitiative $marketingInitiative, MarketingInitiativeActivity $marketingInitiativeActivity) {
        if ($error = $this->assertBelongsTo($marketingInitiativeActivity, 'marketing_initiative_id', $marketingInitiative->id, 'Activity does not belong to this initiative')) {
            return $error;
        }

        $marketingInitiativeActivity->deleteWithReparent();

        return response()->json(['message' => 'Activity deleted successfully']);
    }
    public function attachInitiativeActivityMetric(Request $request, MarketingInitiative $marketingInitiative, MarketingInitiativeActivity $marketingInitiativeActivity) {
        $validated = $request->validate(['metric_id' => 'required|exists:marketing_performance_metrics,id']);
        $marketingInitiativeActivity->performanceMetrics()->syncWithoutDetaching([$validated['metric_id']]);

        return response()->json(['message' => 'Metric attached']);
    }
    public function detachInitiativeActivityMetric(MarketingInitiative $marketingInitiative, MarketingInitiativeActivity $marketingInitiativeActivity, MarketingPerformanceMetric $marketingPerformanceMetric) {
        $marketingInitiativeActivity->performanceMetrics()->detach($marketingPerformanceMetric->id);

        return response()->json(['message' => 'Metric detached']);
    }
}
