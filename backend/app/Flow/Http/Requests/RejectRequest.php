<?php

namespace App\Flow\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class RejectRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'reason' => 'required|string|max:2000',
        ];
    }
}
