<?php

namespace App\Http\Requests\Marketing;

use Illuminate\Foundation\Http\FormRequest;

class ConvertProspectRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'company_id'   => 'nullable|integer|exists:companies,id,deleted_at,NULL',
            'create_new'   => 'required|boolean',
            'company_name' => 'required_if:create_new,true|nullable|string|max:255',
        ];
    }
}
