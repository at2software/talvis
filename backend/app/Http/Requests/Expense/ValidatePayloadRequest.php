<?php

namespace App\Http\Requests\Expense;

use App\Enums\InvoiceItemType;
use Illuminate\Foundation\Http\FormRequest;

class ValidatePayloadRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'category_id'     => 'nullable|integer|exists:expense_categories,id',
            'name'            => 'string',
            'price'           => 'numeric',
            'repeat'          => 'in:'.implode(',', array_column(InvoiceItemType::Repeating, 'value')),
            'matching_string' => 'nullable|string|max:500',
        ];
    }
}
