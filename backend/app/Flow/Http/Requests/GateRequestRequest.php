<?php

namespace App\Flow\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class GateRequestRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'gate_key'       => 'required|string|max:255',
            'options'        => 'nullable|array|list|max:10',
            'options.*'      => 'string|max:255|distinct',
            'recommendation' => 'nullable|string|max:2000',
            'source'         => 'nullable|in:agent,rule_check',
            'diff_url'       => 'nullable|url:http,https|max:2048',
        ];
    }
}
