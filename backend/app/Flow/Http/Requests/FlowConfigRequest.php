<?php

namespace App\Flow\Http\Requests;

use App\Flow\Models\Gate;
use App\Flow\Models\JobType;
use App\Flow\Models\Phase;
use App\Flow\Models\RiskClass;
use App\Flow\Models\Transition;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FlowConfigRequest extends FormRequest {
    public const MODELS = [
        'transitions'  => Transition::class,
        'phases'       => Phase::class,
        'gates'        => Gate::class,
        'risk-classes' => RiskClass::class,
        'job-types'    => JobType::class,
    ];
    private const KEY = 'regex:/^[a-z][a-z0-9_]*$/';

    public function authorize(): bool {
        return true;
    }
    public function rules(): array {
        $id       = $this->route('id');
        $creating = $this->isMethod('post');
        $required = $creating ? 'required' : 'sometimes';
        $role     = Rule::exists('roles', 'name')->where('guard_name', 'api');

        return match ($this->route('resource')) {
            'transitions' => [
                'from_state_id' => [$creating ? 'required' : 'prohibited', 'integer', 'exists:project_states,id'],
                'to_state_id'   => [$creating ? 'required' : 'prohibited', 'integer', 'exists:project_states,id', 'different:from_state_id', Rule::unique('flow_transitions')->where('from_state_id', $this->input('from_state_id'))],
                'required_role' => ['nullable', 'string', $role],
                'active'        => ['sometimes', 'boolean'],
            ],
            'phases' => [
                'key'              => [$required, 'string', 'max:64', self::KEY, Rule::unique('flow_phases')->ignore($id)],
                'name'             => [$required, 'string', 'max:255'],
                'project_state_id' => [$required, 'integer', 'exists:project_states,id', Rule::unique('flow_phases')->ignore($id)],
                'sort'             => ['sometimes', 'integer', 'min:0', 'max:65535'],
            ],
            'gates' => [
                'phase_id'           => [$creating ? 'required' : 'prohibited', 'integer', 'exists:flow_phases,id'],
                'key'                => [$required, 'string', 'max:64', self::KEY, Rule::unique('flow_gates')->ignore($id)->where('phase_id', $this->input('phase_id') ?? Gate::find($id)?->phase_id)],
                'name'               => [$required, 'string', 'max:255'],
                'required_role'      => [$required, 'string', $role],
                'required_approvals' => ['nullable', 'integer', 'min:1', 'max:10'],
                'condition'          => ['nullable', 'array'],
                'sort'               => ['sometimes', 'integer', 'min:0', 'max:65535'],
            ],
            'risk-classes' => [
                'key'                        => [$required, 'string', 'max:64', self::KEY, Rule::unique('flow_risk_classes')->ignore($id)],
                'name'                       => [$required, 'string', 'max:255'],
                'level'                      => [$required, 'integer', 'min:0', 'max:100'],
                'release_required_approvals' => [$required, 'integer', 'min:1', 'max:10'],
            ],
            'job-types' => [
                'key'                => [$required, 'string', 'max:64', self::KEY, Rule::unique('flow_job_types')->ignore($id)],
                'name'               => [$required, 'string', 'max:255'],
                'description'        => ['nullable', 'string', 'max:5000'],
                'input_schema'       => [$required, 'array'],
                'review_gate_keys'   => ['nullable', 'array', 'list', 'max:10'],
                'review_gate_keys.*' => ['string', 'max:64', self::KEY, 'distinct'],
            ],
        };
    }
    public function modelClass(): string {
        return self::MODELS[$this->route('resource')];
    }
}
