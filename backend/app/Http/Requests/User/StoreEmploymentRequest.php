<?php

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;

class StoreEmploymentRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'description'   => 'sometimes|string|max:255',
            'mo'            => 'required|numeric|between:0,24',
            'tu'            => 'required|numeric|between:0,24',
            'we'            => 'required|numeric|between:0,24',
            'th'            => 'required|numeric|between:0,24',
            'fr'            => 'required|numeric|between:0,24',
            'sa'            => 'required|numeric|between:0,24',
            'su'            => 'required|numeric|between:0,24',
            'is_time_based' => 'required|boolean',
            'is_active'     => 'sometimes|boolean',
            'started_at'    => 'required|date',
        ];
    }
}
