<?php

namespace App\Http\Requests\Timetracker;

use Illuminate\Foundation\Http\FormRequest;

class ParentRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'project_id' => 'required_without_all:company_id|integer|exists:App\Models\Project,id,deleted_at,NULL',
            'company_id' => 'required_without_all:project_id|integer|exists:App\Models\Company,id,deleted_at,NULL',
        ];
    }
}
