<?php

namespace App\Http\Requests\Marketing;

use Illuminate\Foundation\Http\FormRequest;

class StoreInitiativeActivityRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'marketing_workflow_id'   => 'nullable|exists:marketing_workflows,id',
            'name'                    => 'required|string|max:255',
            'day_offset'              => 'required|integer|min:1',
            'description'             => 'nullable|string',
            'is_required'             => 'boolean',
            'has_external_dependency' => 'boolean',
            'parent_activity_id'      => 'nullable|exists:marketing_initiative_activities,id',
            'metric_ids'              => 'array',
            'metric_ids.*'            => 'exists:marketing_performance_metrics,id',
            'quick_action'            => 'nullable|in:EMAIL,LINKEDIN,LINKEDIN_SEARCH,CALL',
            'is_shared'               => 'boolean',
        ];
    }
}
