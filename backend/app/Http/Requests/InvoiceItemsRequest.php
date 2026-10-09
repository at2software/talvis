<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class InvoiceItemsRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'items'                      => 'required|array|min:1',
            'items.*.company_id'         => 'nullable|exists:companies,id,deleted_at,NULL',
            'items.*.discount'           => 'nullable|numeric|min:0|max:100',
            'items.*.is_discountable'    => 'nullable|boolean',
            'items.*.next_recurrence_at' => 'nullable|date',
            'items.*.price'              => 'required|numeric|min:0',
            'items.*.product_id'         => 'nullable|exists:products,id,deleted_at,NULL',
            'items.*.product_source_id'  => 'nullable|exists:products,id,deleted_at,NULL',
            'items.*.project_id'         => 'nullable|exists:projects,id,deleted_at,NULL',
            'items.*.qty'                => 'required|numeric|min:0',
            'items.*.text'               => 'required|string|max:255',
            'items.*.unit_name'          => 'nullable|string|max:50',
            'items.*.vat_rate'           => 'nullable|numeric|min:0|max:100',
            'items.*.vat_reason'         => 'nullable|string',
        ];
    }
    public function messages(): array {
        return [
            'items.required'         => 'Items array is required',
            'items.array'            => 'Items must be an array',
            'items.min'              => 'At least one item is required',
            'items.*.price.required' => 'Price is required for each item',
            'items.*.qty.required'   => 'Quantity is required for each item',
            'items.*.text.required'  => 'Text description is required for each item',
            'items.*.type.required'  => 'Item type is required for each item',
        ];
    }
}
