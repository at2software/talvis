<?php

namespace App\Http\Requests\Marketing;

use App\Enums\TouchpointChannel;
use App\Enums\TouchpointOutcome;
use App\Enums\TouchpointResult;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class LogTouchpointRequest extends FormRequest {
    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        return [
            'marketing_prospect_activity_id' => 'nullable|integer|exists:marketing_prospect_activities,id',
            'channel'                        => ['required', Rule::enum(TouchpointChannel::class)],
            'result'                         => ['required', Rule::enum(TouchpointResult::class)],
            'outcome'                        => ['nullable', Rule::enum(TouchpointOutcome::class)],
            'notes'                          => 'nullable|string',
            'retry_at'                       => 'nullable|date|after_or_equal:today',
        ];
    }
    public function after(): array {
        return [
            function (Validator $validator) {
                $channel = TouchpointChannel::tryFrom((string)$this->input('channel'));
                $result  = TouchpointResult::tryFrom((string)$this->input('result'));
                if ($channel && $result && ! in_array($result, $channel->results())) {
                    $validator->errors()->add('result', "Result '{$result->value}' is not valid for channel '{$channel->value}'");
                }
            },
        ];
    }
}
