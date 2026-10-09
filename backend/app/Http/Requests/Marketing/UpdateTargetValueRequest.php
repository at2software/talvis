<?php

namespace App\Http\Requests\Marketing;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTargetValueRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'target_value' => 'nullable|numeric|min:0|max:99999999.99',
        ];
    }
}
