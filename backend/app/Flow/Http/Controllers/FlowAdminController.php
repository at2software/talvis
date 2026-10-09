<?php

namespace App\Flow\Http\Controllers;

use App\Flow\Http\Requests\FlowConfigRequest;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Job;
use App\Flow\Models\JobType;
use App\Flow\Models\Phase;
use App\Flow\Models\RiskClass;
use App\Flow\Models\Transition;
use App\Http\Controllers\Controller;
use App\Models\ProjectState;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Spatie\Permission\Models\Role;

class FlowAdminController extends Controller {
    public function index() {
        return [
            'states'       => ProjectState::orderBy('id')->get(['id', 'name', 'color', 'progress']),
            'transitions'  => Transition::orderBy('from_state_id')->orderBy('to_state_id')->get(),
            'phases'       => Phase::with('gates')->orderBy('sort')->get(),
            'risk_classes' => RiskClass::orderBy('level')->get(),
            'job_types'    => JobType::withCount(['jobs'])->orderBy('key')->get(),
            'roles'        => Role::where('guard_name', 'api')->orderBy('name')->pluck('name'),
        ];
    }
    public function store(FlowConfigRequest $request, string $resource) {
        return response()->json($this->persist($request, new ($request->modelClass()), 'created'), 201);
    }
    public function update(FlowConfigRequest $request, string $resource, int $id) {
        return $this->persist($request, $request->modelClass()::findOrFail($id), 'updated');
    }
    public function destroy(FlowConfigRequest $request, string $resource, int $id) {
        $model = $request->modelClass()::findOrFail($id);
        if ($model instanceof JobType && Job::where('type', $model->key)->exists()) {
            abort(409, 'This job type is used by existing jobs and cannot be deleted.');
        }
        DB::transaction(function () use ($model, $request, $resource) {
            AuditEntry::record($model, "config.{$resource}.deleted", $request->user(), ['attributes' => $model->attributesToArray()]);
            $model->delete();
        });
        return response()->noContent();
    }
    private function persist(FlowConfigRequest $request, Model $model, string $action) {
        $resource = $request->route('resource');
        return DB::transaction(function () use ($request, $model, $action, $resource) {
            $before = $model->exists ? $model->only(array_keys($request->validated())) : null;
            try {
                $model->fill($request->validated())->save();
            } catch (InvalidArgumentException $e) {
                throw ValidationException::withMessages([$resource === 'gates' ? 'condition' : 'input_schema' => $e->getMessage()]);
            }
            AuditEntry::record($model, "config.{$resource}.{$action}", $request->user(), array_filter([
                'before' => $before,
                'after'  => $model->only(array_keys($request->validated())),
            ], fn ($value) => $value !== null));
            return $model->fresh();
        });
    }
}
