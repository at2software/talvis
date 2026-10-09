<?php

namespace App\Http\Requests\Project;

use App\Flow\Rules\AllowedProjectTransition;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProjectRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'state'                    => ['nullable', 'integer', 'exists:project_states,id', new AllowedProjectTransition($this->route('project'), $this->user())],
            'reason'                   => 'nullable|string|max:2000',
            'project_id'               => 'nullable|integer|exists:projects,id,deleted_at,NULL',
            'po_number'                => 'nullable|string|max:255',
            'disabled_quote_sources'   => 'nullable|array',
            'disabled_quote_sources.*' => 'string',
        ];
    }
}
