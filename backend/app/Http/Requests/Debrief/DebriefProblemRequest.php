<?php

namespace App\Http\Requests\Debrief;

use Illuminate\Foundation\Http\FormRequest;

class DebriefProblemRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $isStore = $this->isMethod('POST');

        $rules = [
            'severity'      => 'sometimes|in:low,medium,high,critical',
            'context_notes' => 'nullable|string',
        ];

        if ($isStore) {
            $rules['debrief_problem_id'] = 'required|exists:debrief_problems,id,deleted_at,NULL';
        }

        return $rules;
    }
}
