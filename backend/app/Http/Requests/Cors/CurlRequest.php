<?php

namespace App\Http\Requests\Cors;

use Illuminate\Foundation\Http\FormRequest;

class CurlRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'method'    => 'required|in:get,post,put,delete,patch',
            'url'       => 'required|url',
            'headers'   => 'nullable|array',
            'headers.*' => ['string', 'regex:/^[!#$%&\'*+.^_`|~0-9A-Za-z-]+:[^\r\n]*\z/'],
            'timeout'   => 'nullable|integer|min:1|max:120',
            'data'      => 'nullable|array',
        ];
    }
}
