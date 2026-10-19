<?php

namespace App\Http\Controllers;

use App\Enums\TouchpointChannel;
use App\Http\Requests\Marketing\LogTouchpointRequest;
use App\Models\Company;
use App\Models\MarketingProspect;
use App\Models\MarketingProspectActivity;
use App\Models\MarketingTouchpoint;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class MarketingTouchpointController extends Controller {
    public function indexQueue(Request $request) {
        $validated = $request->validate([
            'channel'                 => ['nullable', Rule::enum(TouchpointChannel::class)],
            'user_id'                 => 'nullable|integer',
            'marketing_initiative_id' => 'nullable|integer',
        ]);
        return MarketingProspectActivity::outreachQueue(
            TouchpointChannel::tryFrom($validated['channel'] ?? '') ?? TouchpointChannel::Call,
            $request->has('user_id') ? ($validated['user_id'] ?? null) : $request->user()->id,
            $validated['marketing_initiative_id'] ?? null,
        );
    }
    public function showStats(Request $request) {
        $validated = $request->validate([
            'from'    => 'nullable|date',
            'to'      => 'nullable|date',
            'user_id' => 'nullable|integer',
        ]);
        return MarketingTouchpoint::stats(
            isset($validated['from']) ? now()->parse($validated['from'])->startOfDay() : now()->startOfWeek(),
            isset($validated['to']) ? now()->parse($validated['to'])->endOfDay() : now()->endOfDay(),
            $validated['user_id'] ?? null,
        );
    }
    public function storeCompanyTouchpoint(LogTouchpointRequest $request, Company $company) {
        return $company->logTouchpoint($request->user(), $request->validated())->load('user');
    }
    public function indexProspectTouchpoints(MarketingProspect $marketingProspect) {
        return $marketingProspect->touchpoints()->with('user')->latest('occurred_at')->get();
    }
    public function storeProspectTouchpoint(LogTouchpointRequest $request, MarketingProspect $marketingProspect) {
        $validated = $request->validated();
        $activity  = isset($validated['marketing_prospect_activity_id'])
            ? $marketingProspect->activities()->findOrFail($validated['marketing_prospect_activity_id'])
            : null;

        return $marketingProspect->logTouchpoint($request->user(), $validated, $activity)
            ->load(['user', 'marketingProspectActivity']);
    }
}
