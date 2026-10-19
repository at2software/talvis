<?php

namespace App\Http\Requests\Calendar;

use Illuminate\Foundation\Http\FormRequest;

class ExternalCalendarRequest extends FormRequest {
    protected function prepareForValidation(): void {
        if (is_string($this->url)) {
            $this->merge(['url' => preg_replace('~^webcals?://~i', 'https://', trim($this->url))]);
        }
    }
    public function rules(): array {
        return [
            'url'      => ['required', 'url', 'max:2048', $this->filled('login') ? 'starts_with:https://' : 'starts_with:https://,http://'],
            'login'    => 'nullable|string|max:255',
            'password' => 'nullable|string|max:255',
            'source'   => 'required|string|max:100',
            'start'    => 'required|date',
            'end'      => 'required|date|after:start',
        ];
    }
    public function messages(): array {
        return ['url.starts_with' => 'Calendars with login need an https URL.'];
    }
}
