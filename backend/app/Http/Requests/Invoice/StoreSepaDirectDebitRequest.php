<?php

namespace App\Http\Requests\Invoice;

use Illuminate\Foundation\Http\FormRequest;

class StoreSepaDirectDebitRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'invoice_ids'     => 'required|array|min:1',
            'invoice_ids.*'   => 'integer|distinct|exists:invoices,id,deleted_at,NULL',
            'collection_date' => 'required|date_format:Y-m-d|after:today',
        ];
    }
}
