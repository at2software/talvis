<?php

namespace App\Http\Requests\Setup;

use App\Http\Requests\User\StoreUserRequest;

class StoreOwnerRequest extends StoreUserRequest {
    public function rules(): array {
        return [
            ...parent::rules(),
            'password' => 'required|string|min:8|confirmed',
        ];
    }
}
