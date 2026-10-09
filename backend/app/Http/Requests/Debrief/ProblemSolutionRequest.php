<?php

namespace App\Http\Requests\Debrief;

use Illuminate\Foundation\Http\FormRequest;

class ProblemSolutionRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $isStore = $this->isMethod('POST');

        $rules = [
            'effectiveness_rating' => 'nullable|integer|min:1|max:5',
            'notes'                => 'nullable|string',
        ];

        if ($isStore) {
            $rules += [
                'debrief_solution_id'        => 'required|exists:debrief_solutions,id,deleted_at,NULL',
                'debrief_project_debrief_id' => 'nullable|exists:debrief_project_debriefs,id,deleted_at,NULL',
            ];
        }

        return $rules;
    }
}
