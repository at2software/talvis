<?php

namespace App\Http\Requests\Project;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProjectRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'state'                    => 'nullable|exists:project_states,id',
            'po_number'                => 'nullable|string|max:255',
            'disabled_quote_sources'   => 'nullable|array',
            'disabled_quote_sources.*' => 'string',
        ];
    }
}
