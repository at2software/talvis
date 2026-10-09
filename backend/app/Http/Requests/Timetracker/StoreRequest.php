<?php

namespace App\Http\Requests\Timetracker;

use Illuminate\Foundation\Http\FormRequest;

class StoreRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'duration'                 => 'required|numeric',
            'started_at'               => 'required|date',
            'project_id'               => 'required_without_all:company_id|exists:App\Models\Project,id,deleted_at,NULL',
            'company_id'               => 'required_without_all:project_id|exists:App\Models\Company,id,deleted_at,NULL',
            'is_unpaid'                => 'boolean',
            'item_focus_id'            => 'exists:App\Models\InvoiceItem,id,deleted_at,NULL',
            'ext_issue_plugin_link_id' => 'nullable|required_with:ext_issue_id|exists:App\Models\PluginLink,id,deleted_at,NULL',
            'ext_issue_id'             => 'nullable|required_with:ext_issue_plugin_link_id|string',
        ];
    }
}
