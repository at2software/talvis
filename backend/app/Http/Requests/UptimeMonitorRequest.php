<?php

namespace App\Http\Requests;

use App\Rules\SafeUrl;
use Illuminate\Foundation\Http\FormRequest;

class UptimeMonitorRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';
        return [
            'name'                    => "$req|string|max:255",
            'url'                     => [$req, 'url', 'max:512', new SafeUrl],
            'method'                  => 'sometimes|in:GET,POST,HEAD',
            'expected_status_code'    => 'sometimes|integer|min:100|max:599',
            'timeout'                 => 'sometimes|integer|min:5|max:120',
            'response_time_threshold' => 'sometimes|integer|min:100',
            'check_interval'          => 'sometimes|integer|min:60',
            'is_active'               => 'sometimes|boolean',
            'request_headers'         => 'sometimes|array|nullable',
            'request_body'            => 'sometimes|string|nullable',
            'project_ids'             => 'sometimes|array',
            'project_ids.*'           => 'exists:projects,id,deleted_at,NULL',
            'recipient_ids'           => 'sometimes|array',
            'recipient_ids.*'         => 'exists:users,id',
        ];
    }
}
