<?php

namespace App\Http\Controllers;

use App\Enums\TouchpointChannel;
use App\Http\Controllers\Traits\MarketingControllerHelpers;
use App\Http\Requests\Marketing\ConvertProspectRequest;
use App\Http\Requests\Marketing\ProspectRequest;
use App\Http\Requests\Marketing\StoreProspectFromAddonRequest;
use App\Http\Requests\PhoneLookupRequest;
use App\Models\MarketingProspect;
use App\Models\MarketingProspectActivity;
use App\Models\Vcard;
use App\Services\MarketingDashboardService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MarketingProspectController extends Controller {
    use MarketingControllerHelpers;

    public function indexProspects(Request $request) {
        return MarketingProspect::filteredQuery($request);
    }
    public function showProspectStats(Request $request) {
        return MarketingProspect::getStats();
    }
    public function showProspect(MarketingProspect $marketingProspect) {
        return $marketingProspect->load([
            'marketingInitiative',
            'leadSource',
            'activities.marketingInitiativeActivity.performanceMetrics',
            'activities' => fn ($q) => $q->orderBy('scheduled_at'),
            'companyContact.contact',
            'companyContact.company',
            'touchpoints' => fn ($q) => $q->with('user')->latest('occurred_at'),
        ]);
    }
    public function showProspectDuplicates(MarketingProspect $marketingProspect) {
        return $marketingProspect->findDuplicates();
    }
    public function mergeProspect(Request $request, MarketingProspect $marketingProspect) {
        $validated = $request->validate(['source_id' => 'required|integer|exists:marketing_prospects,id']);

        return $marketingProspect->mergeFrom(MarketingProspect::findOrFail($validated['source_id']));
    }
    public function rescheduleOverdueActivities(Request $request) {
        $validated = $request->validate([
            'date'                    => 'required|date|after_or_equal:today',
            'user_id'                 => 'nullable|integer',
            'marketing_initiative_id' => 'nullable|integer',
            'channel'                 => ['nullable', Rule::enum(TouchpointChannel::class)],
        ]);

        return ['moved' => MarketingProspectActivity::rescheduleOverdue(
            now()->parse($validated['date'])->startOfDay(),
            $request->has('user_id') ? ($validated['user_id'] ?? null) : $request->user()->id,
            $validated['marketing_initiative_id'] ?? null,
            TouchpointChannel::tryFrom($validated['channel'] ?? ''),
        )];
    }
    public function showProspectByPhone(PhoneLookupRequest $request): JsonResponse {
        $prospect = MarketingProspect::searchByPhone($request->validated('phone_number'));
        if (! $prospect) {
            return response()->json(null);
        }

        return response()->json($prospect->load([
            'marketingInitiative',
            'leadSource',
            'companyContact.contact',
            'companyContact.company',
        ]));
    }
    public function storeProspect(ProspectRequest $request) {
        $validated = $request->validated();

        if (! isset($validated['user_id'])) {
            $validated['user_id'] = $request->user()->id;
        }

        $existing = MarketingProspect::findByIdentity(new Vcard($validated['vcard'] ?? ''), $validated['marketing_initiative_id'])->first();
        if ($existing) {
            return response()->json(['error' => 'Prospect already exists', 'prospect' => $existing], 409);
        }

        $prospect = MarketingProspect::create($validated);

        return $prospect->load(['marketingInitiative', 'leadSource', 'user', 'activities']);
    }
    public function storeProspectFromAddon(StoreProspectFromAddonRequest $request) {
        $result = MarketingProspect::createFromAddon($request->validated(), $request->user());

        if (isset($result['error'])) {
            return response()->json($result, 409);
        }

        return $result['prospect'];
    }
    public function updateProspect(ProspectRequest $request, MarketingProspect $marketingProspect) {
        $marketingProspect->update($request->validated());

        return $marketingProspect->load([
            'marketingInitiative',
            'leadSource',
            'user',
            'activities',
            'companyContact.contact',
            'companyContact.company',
        ]);
    }
    public function postponeProspectActivities(Request $request, MarketingProspect $marketingProspect) {
        $validated = $request->validate(['days' => 'required|integer|min:1|max:365']);

        $success = $marketingProspect->postponeActivities($validated['days']);

        if (! $success) {
            return response()->json(['error' => 'No pending activities to postpone'], 422);
        }

        return $marketingProspect->fresh(['activities']);
    }
    public function destroyProspect(MarketingProspect $marketingProspect) {
        $marketingProspect->delete();

        return response()->json(['message' => 'Prospect deleted successfully']);
    }
    public function linkProspectToCompany(Request $request, MarketingProspect $marketingProspect) {
        $validated = $request->validate(['company_id' => 'required|integer|exists:companies,id,deleted_at,NULL']);

        return $marketingProspect->linkToCompany($validated['company_id']);
    }
    public function convertProspect(ConvertProspectRequest $request, MarketingProspect $marketingProspect) {
        $validated = $request->validated();

        $result = $marketingProspect->convert(
            $validated['create_new'],
            $validated['company_id'] ?? null,
            $validated['company_name'] ?? null
        );

        if (isset($result['error'])) {
            $statusCode = match (true) {
                str_contains($result['error'], 'already converted') => 400,
                str_contains($result['error'], 'no vcard data'),
                str_contains($result['error'], 'no company')        => 422,
                default                                             => 500,
            };

            return response()->json(['error' => $result['error']], $statusCode);
        }

        return $result['prospect'];
    }
    public function indexProspectActivitiesForAddon(Request $request) {
        $validated = $request->validate([
            'lead_source_id'          => 'nullable|integer',
            'marketing_initiative_id' => 'nullable|integer',
        ]);
        return MarketingDashboardService::getOverdueActivitiesForAddon(
            $request->user()->id,
            isset($validated['lead_source_id']) ? (int)$validated['lead_source_id'] : null,
            isset($validated['marketing_initiative_id']) ? (int)$validated['marketing_initiative_id'] : null,
            $request->boolean('count_only')
        );
    }
    public function updateProspectActivityStatus(Request $request, MarketingProspect $marketingProspect, int $activityId) {
        $validated = $request->validate($this->prospectActivityStatusRules());

        $activity = $marketingProspect->activities()->find($activityId);

        if (! $activity) {
            return response()->json(['error' => 'Activity not found'], 404);
        }

        if (! $this->applyActivityStatusUpdate($activity, $marketingProspect, $validated)) {
            return response()->json(['error' => 'Failed to update activity'], 422);
        }

        return $activity->fresh(['marketingActivity']);
    }
    public function updateProspectActivityById(Request $request, int $activityId) {
        $validated = $request->validate($this->prospectActivityStatusRules());

        $activity = MarketingProspectActivity::find($activityId);

        if (! $activity) {
            return response()->json(['error' => 'Activity not found'], 404);
        }

        $marketingProspect = $activity->marketingProspect;

        if (! $this->applyActivityStatusUpdate($activity, $marketingProspect, $validated)) {
            return response()->json(['error' => 'Failed to update activity'], 422);
        }

        if ($validated['status'] === 'completed') {
            $activity->shiftSucceedingActivities();
        }

        return $activity->fresh(['marketingActivity', 'marketingProspect']);
    }
    public function bumpProspectActivity(int $activityId) {
        $activity = MarketingProspectActivity::find($activityId);

        if (! $activity) {
            return response()->json(['error' => 'Activity not found'], 404);
        }

        $activity->bump();

        return $activity->fresh(['marketingActivity', 'marketingProspect']);
    }
}
