<?php

namespace App\Http\Requests\Setup;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCompanyRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    protected function prepareForValidation(): void {
        $this->merge([
            'iban'    => strtoupper(preg_replace('/\s+/', '', (string)$this->input('iban'))) ?: null,
            'bic'     => strtoupper(preg_replace('/\s+/', '', (string)$this->input('bic'))) ?: null,
            'vat_id'  => strtoupper(preg_replace('/\s+/', '', (string)$this->input('vat_id'))) ?: null,
            'country' => strtoupper(trim((string)$this->input('country'))) ?: null,
        ]);
    }
    public function rules(): array {
        return [
            'name'       => 'required|string|max:255',
            'legal_form' => 'nullable|string|max:50',
            'owners'     => 'nullable|string|max:255',
            'street'     => 'required|string|max:255',
            'zip'        => 'required|string|max:16',
            'city'       => 'required|string|max:255',
            'country'    => 'required|string|size:2|alpha',
            'url'        => 'nullable|string|max:255',
            'email'      => 'required|email|max:255',
            'phone'      => 'nullable|string|max:64',
            'iban'       => ['required', 'regex:/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', fn ($attribute, $value, $fail) => self::ibanChecksumValid($value) || $fail('The IBAN checksum is invalid.')],
            'bic'        => ['nullable', 'regex:/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/'],
            'tax_id'     => 'required_without:vat_id|nullable|string|max:32',
            'vat_id'     => ['required_without:tax_id', 'nullable', 'regex:/^(DE\d{9}|(?!DE)[A-Z]{2}[0-9A-Z+*.]{2,12})$/'],
        ];
    }
    private static function ibanChecksumValid(string $iban): bool {
        $digits = '';
        foreach (str_split(substr($iban, 4).substr($iban, 0, 4)) as $char) {
            $digits .= ctype_alpha($char) ? (string)(ord($char) - 55) : $char;
        }
        $remainder = 0;
        foreach (str_split($digits, 7) as $chunk) {
            $remainder = (int)($remainder.$chunk) % 97;
        }
        return $remainder === 1;
    }
}
