<?php

namespace App\Http\Requests\Focus;

use Illuminate\Foundation\Http\FormRequest;

class LinkFociToInvoiceItemRequest extends FormRequest {
    public function authorize(): bool {
        return true; // role:hr|project_manager is enforced by the route group
    }
    public function rules(): array {
        return [
            'itemIds'       => 'required|array|min:1',
            'itemIds.*'     => 'required|integer|distinct',
            'invoiceItemId' => 'required|integer',
        ];
    }
}
