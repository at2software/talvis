<?php

namespace App\Http\Requests\Setup;

use Illuminate\Foundation\Http\FormRequest;

class UpdateInvoicingRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'INVOICE_DEFAULT_VAT'      => 'required|numeric|between:0,100',
            'INVOICE_PAYMENT_DURATION' => 'required|integer|between:0,365',
            'INVOICE_HOURLY_WAGE'      => 'nullable|numeric|min:0',
            'INVOICE_NO_PREFIX'        => 'nullable|string|max:32',
            'INVOICE_NO_DIGITS'        => 'required|integer|between:1,12',
            'INVOICE_NO_CURRENT'       => 'required|integer|min:1',
            'QUOTE_NO_PREFIX'          => 'nullable|string|max:32',
            'QUOTE_NO_DIGITS'          => 'required|integer|between:1,12',
            'QUOTE_NO_CURRENT'         => 'required|integer|min:1',
        ];
    }
}
