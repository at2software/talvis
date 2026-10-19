<?php

namespace App\Flow\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class JobResultRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'mr_url'      => 'nullable|url:http,https|max:2048',
            'mr_urls'     => 'nullable|array|list|max:20',
            'mr_urls.*'   => 'url:http,https|max:2048|distinct',
            'test_report' => 'nullable|string|max:65535',
            'metrics'     => 'nullable|array|max:50',
            'metrics.*'   => 'numeric',
            'knowledge'   => 'nullable|array|max:50',
        ];
    }
}
