<?php

namespace App\Http\Requests\Debrief;

use Illuminate\Foundation\Http\FormRequest;

class DebriefRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $isStore = $this->isMethod('POST');

        $rules = [
            'debriefed_user_id' => 'nullable|integer|exists:users,id',
        ];

        if (! $isStore) {
            $rules += [
                'summary_notes' => 'nullable|string',
                'rating'        => 'nullable|integer|min:1|max:5',
                'status'        => 'sometimes|in:draft,completed',
            ];
        }

        return $rules;
    }
}
