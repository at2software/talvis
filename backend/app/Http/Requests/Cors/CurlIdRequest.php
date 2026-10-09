<?php

namespace App\Http\Requests\Cors;

class CurlIdRequest extends CurlRequest {
    public function rules(): array {
        return [
            ...parent::rules(),
            'idKey' => 'required|alpha_dash',
        ];
    }
}
