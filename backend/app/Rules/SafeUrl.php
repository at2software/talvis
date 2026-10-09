<?php

namespace App\Rules;

use App\Exceptions\SsrfException;
use App\Services\SafeUrlGuard;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class SafeUrl implements ValidationRule {
    public function validate(string $attribute, mixed $value, Closure $fail): void {
        try {
            app(SafeUrlGuard::class)->validate((string)$value);
        } catch (SsrfException $e) {
            $fail($e->getMessage());
        }
    }
}
