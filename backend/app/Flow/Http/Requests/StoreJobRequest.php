<?php

namespace App\Flow\Http\Requests;

use App\Flow\JobInputSchema;
use App\Flow\Models\JobType;
use Illuminate\Foundation\Http\FormRequest;

class StoreJobRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $type = JobType::byKey((string)$this->input('type'));
        return [
            'type' => 'required|string|exists:flow_job_types,key',
            ...($type ? JobInputSchema::rules($type->input_schema) : ['input' => ['present', 'array']]),
        ];
    }
    public function after(): array {
        return [function ($validator) {
            $type  = JobType::byKey((string)$this->input('type'));
            $input = $this->input('input');
            if ($type && is_array($input)) {
                $unknown = array_diff(array_keys($input), array_column($type->input_schema['fields'], 'key'));
                if ($unknown !== []) {
                    $validator->errors()->add('input', 'Unknown input fields: '.implode(', ', $unknown).'.');
                }
            }
        }];
    }
}
