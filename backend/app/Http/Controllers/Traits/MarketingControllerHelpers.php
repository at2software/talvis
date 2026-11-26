<?php

namespace App\Http\Controllers\Traits;

use App\Models\MarketingProspect;
use App\Models\MarketingProspectActivity;
use Illuminate\Http\JsonResponse;

trait MarketingControllerHelpers {
    protected function assertBelongsTo($child, string $foreignKey, int $parentId, string $message, int $status = 422): ?JsonResponse {
        return $parentId !== $child->$foreignKey
            ? response()->json(['error' => $message], $status)
            : null;
    }
    protected function activityUpdateRules(string $parentTable): array {
        return [
            'name'                    => 'string|max:255',
            'day_offset'              => 'integer|min:1',
            'description'             => 'nullable',
            'description.*.language'  => 'sometimes|string|max:10',
            'description.*.formality' => 'sometimes|string|max:20',
            'description.*.text'      => 'sometimes|string',
            'description.language'    => 'sometimes|string|max:10',
            'description.formality'   => 'sometimes|string|max:20',
            'description.text'        => 'sometimes|string',
            'is_required'             => 'boolean',
            'has_external_dependency' => 'boolean',
            'parent_activity_id'      => "nullable|exists:{$parentTable},id",
            'quick_action'            => 'nullable|in:EMAIL,LINKEDIN,LINKEDIN_SEARCH,CALL',
            'is_shared'               => 'boolean',
        ];
    }
    protected function metricAttachRules(): array {
        return [
            'metric_id'    => 'required|exists:marketing_performance_metrics,id',
            'target_value' => 'nullable|numeric|min:0',
        ];
    }
    protected function prospectActivityStatusRules(): array {
        return [
            'status'            => 'required|in:completed,skipped,failed,pending,overdue',
            'notes'             => 'nullable|string',
            'performance_value' => 'nullable|numeric',
        ];
    }
    protected function applyActivityStatusUpdate(MarketingProspectActivity $activity, MarketingProspect $prospect, array $validated): bool {
        if ($validated['status'] === 'completed') {
            return (bool)$prospect->markActivityCompleted(
                $activity->id,
                $validated['notes'] ?? null,
                $validated['performance_value'] ?? null
            );
        }

        return $activity->update([
            'status' => $validated['status'],
            'notes'  => $validated['notes'] ?? null,
        ]);
    }
}
