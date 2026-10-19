<?php

namespace App\Flow\Http\Requests;

use App\Flow\Models\Job;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class IndexJobsRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'state'      => ['nullable', Rule::in(Job::STATES)],
            'type'       => 'nullable|string|max:255',
            'claimed_by' => 'nullable|string|max:255',
            'limit'      => 'nullable|integer|min:1|max:100',
        ];
    }
}
