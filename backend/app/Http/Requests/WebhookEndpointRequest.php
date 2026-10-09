<?php

namespace App\Http\Requests;

use App\Rules\SafeUrl;
use Illuminate\Foundation\Http\FormRequest;

class WebhookEndpointRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';
        return [
            'name'      => "$req|string|max:255",
            'url'       => [$req, 'url:https', 'max:512', new SafeUrl],
            'is_active' => 'sometimes|boolean',
        ];
    }
}
