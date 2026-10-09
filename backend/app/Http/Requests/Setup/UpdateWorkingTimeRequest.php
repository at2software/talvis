<?php

namespace App\Http\Requests\Setup;

use App\Models\UserEmployment;
use Illuminate\Foundation\Http\FormRequest;

class UpdateWorkingTimeRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            ...array_fill_keys(array_map(fn ($_) => "hours.$_", UserEmployment::DAYS), 'required|numeric|between:0,24'),
            'work_zip'      => 'required|digits:5',
            'vacation_days' => 'required|numeric|between:0,366',
        ];
    }
}
