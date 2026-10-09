<?php

namespace App\Http\Requests;

use App\Enums\WebhookEvent;
use App\Rules\SafeUrl;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WebhookEndpointRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';
        return [
            'name'      => "$req|string|max:255",
            'url'       => [$req, 'url:https', 'max:512', new SafeUrl],
            'events'    => "$req|array|min:1",
            'events.*'  => ['string', 'distinct', Rule::in(WebhookEvent::subscribable())],
            'is_active' => 'sometimes|boolean',
        ];
    }
}
