<?php

namespace App\Http\Requests\Company;

use App\Enums\ConnectionSource;
use App\Enums\ConnectionType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateConnectionRequest extends FormRequest {
    public static function attributeRules(): array {
        return [
            'type'        => ['nullable', Rule::enum(ConnectionType::class)],
            'source'      => ['sometimes', Rule::enum(ConnectionSource::class)],
            'source_url'  => 'nullable|url|max:2048',
            'verified_at' => 'nullable|date',
        ];
    }
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [...self::attributeRules(), 'reverse' => 'sometimes|boolean'];
    }
}
