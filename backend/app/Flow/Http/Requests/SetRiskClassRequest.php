<?php

namespace App\Flow\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SetRiskClassRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'flow_risk_class_id' => 'present|nullable|integer|exists:flow_risk_classes,id',
        ];
    }
}
