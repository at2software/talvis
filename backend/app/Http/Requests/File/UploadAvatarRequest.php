<?php

namespace App\Http\Requests\File;

use Illuminate\Foundation\Http\FormRequest;

class UploadAvatarRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'file' => 'required|image|mimes:jpeg,png,jpg,gif,webp|max:2048',
        ];
    }
}
