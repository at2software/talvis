<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class MilestoneRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $isStore = $this->isMethod('POST');

        $rules = [
            'name'                     => 'string|nullable',
            'started_at'               => 'date|nullable',
            'due_at'                   => 'date|nullable',
            'duration'                 => 'integer|min:0|nullable',
            'progress'                 => 'numeric|min:0|max:100|nullable',
            'state'                    => 'integer|nullable',
            'position'                 => 'integer|nullable',
            'workload_hours'           => 'numeric|min:0|nullable',
            'ext_issue_plugin_link_id' => 'integer|exists:plugin_links,id,deleted_at,NULL|nullable',
            'ext_issue_id'             => 'string|max:255|nullable',
        ];

        if (! $isStore) {
            $rules += [
                'comments'   => 'string|nullable',
                'user_id'    => 'integer|exists:users,id|nullable',
                'project_id' => 'integer|exists:projects,id,deleted_at,NULL|nullable',
                'depends_on' => 'nullable|integer|exists:milestones,id,deleted_at,NULL',
            ];
        }

        return $rules;
    }
}
