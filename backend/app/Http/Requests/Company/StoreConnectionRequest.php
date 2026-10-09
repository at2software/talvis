<?php

namespace App\Http\Requests\Company;

use Illuminate\Foundation\Http\FormRequest;

class StoreConnectionRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'company1_id' => 'required|integer|exists:App\Models\Company,id,deleted_at,NULL',
            'company2_id' => 'required|integer|exists:App\Models\Company,id,deleted_at,NULL',
        ];
    }
}
