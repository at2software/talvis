<?php

namespace App\Flow\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ApproveRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'reason'          => 'nullable|string|max:2000',
            'selected_option' => 'nullable|string|max:255',
        ];
    }
}
