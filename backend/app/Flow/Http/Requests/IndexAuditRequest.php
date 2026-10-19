<?php

namespace App\Flow\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class IndexAuditRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'subject'    => 'nullable|string|max:64|alpha',
            'subject_id' => 'nullable|integer|min:1',
            'action'     => 'nullable|string|max:64|regex:/^[a-z_.-]+$/',
            'actor_type' => 'nullable|in:user,machine,system',
            'page'       => 'nullable|integer|min:1',
        ];
    }
}
