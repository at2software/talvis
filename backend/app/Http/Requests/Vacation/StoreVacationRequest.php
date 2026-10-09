<?php

namespace App\Http\Requests\Vacation;

use App\Models\VacationGrant;
use Closure;
use Illuminate\Foundation\Http\FormRequest;

class StoreVacationRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'amount'            => 'required|numeric|lt:0',
            'state'             => 'required|numeric|in:0',
            'started_at'        => 'required|date',
            'ended_at'          => 'required|date',
            'comment'           => 'nullable|string',
            'vacation_grant_id' => [
                'required',
                function (string $att, mixed $val, Closure $fail) {
                    if (! ($v = VacationGrant::find($val))) {
                        $fail('no valid grant pool');
                        return;
                    }
                    if ($v->user_id != $this->user()->id) {
                        $fail('not your grant pool');
                    }
                },
            ],
        ];
    }
}
