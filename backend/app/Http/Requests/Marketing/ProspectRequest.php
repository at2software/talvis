<?php

namespace App\Http\Requests\Marketing;

use Illuminate\Foundation\Http\FormRequest;

class ProspectRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $isStore = $this->isMethod('POST');
        $req     = $isStore ? 'required' : 'sometimes';

        $rules = [
            'marketing_initiative_id' => "$req|integer|exists:marketing_initiatives,id",
            'lead_source_id'          => ($isStore ? 'nullable|' : '').'integer|exists:lead_sources,id',
            'user_id'                 => 'nullable|integer|exists:users,id',
            'company_id'              => 'nullable|integer|exists:companies,id,deleted_at,NULL',
            'company_contact_id'      => 'nullable|integer|exists:company_contacts,id',
            'name'                    => ($isStore ? 'nullable|' : '').'string|max:255',
            'vcard'                   => 'nullable|string',
            'email'                   => 'nullable|email|max:255',
            'linkedin_url'            => 'nullable|url|max:500',
            'phone'                   => 'nullable|string|max:50',
            'company'                 => 'nullable|string|max:255',
            'position'                => 'nullable|string|max:255',
            'status'                  => 'in:new,engaged,converted,unresponsive,disqualified,on_hold',
            'external_data'           => 'nullable|array',
            'notes'                   => 'nullable|string',
        ];

        if ($isStore) {
            $rules['added_via'] = 'in:addon,manual,import';
        }

        return $rules;
    }
}
