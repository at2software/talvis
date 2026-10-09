<?php

namespace App\Flow\Http\Controllers;

use App\Flow\Http\Requests\SetRiskClassRequest;
use App\Flow\Http\Requests\StoreJobRequest;
use App\Flow\Http\Resources\JobResource;
use App\Flow\JobStateMachine;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Job;
use App\Flow\Models\Phase;
use App\Flow\PhaseService;
use App\Http\Controllers\Controller;
use App\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProjectFlowController extends Controller {
    public function __construct(private readonly PhaseService $phases) {}

    public function phase(Project $project) {
        $phase = $this->phases->currentPhase($project);
        $next  = $phase ? Phase::where('sort', '>', $phase->sort)->orderBy('sort')->first() : null;
        return [
            'project_id' => $project->id,
            'state_id'   => $project->state?->id,
            'phase'      => $phase?->only(['id', 'key', 'name', 'sort']),
            'next_phase' => $next?->only(['id', 'key', 'name', 'sort']),
            'risk_class' => $project->flowRiskClass?->only(['id', 'key', 'name', 'level', 'release_required_approvals']),
            'gates'      => $phase ? $this->phases->gateStatus($project, $phase)->values() : [],
        ];
    }
    public function jobs(Project $project) {
        return JobResource::collection(Job::where('project_id', $project->id)->with('approvals', 'lastEvent')->latest('id')->get())->resolve();
    }
    public function storeJob(StoreJobRequest $request, Project $project, JobStateMachine $jobs) {
        $job = $jobs->create([
            'project_id'    => $project->id,
            'type'          => $request->validated('type'),
            'input'         => $request->validated('input'),
            'created_by_id' => $request->user()->id,
        ], $request->user());
        return (new JobResource($job->load('approvals', 'lastEvent')))->response()->setStatusCode(201);
    }
    public function requestGate(Request $request, Project $project, string $gateKey) {
        $gate = $this->phases->gateInCurrentPhase($project, $gateKey);
        if (! $gate) {
            throw ValidationException::withMessages(['gate_key' => 'The project\'s current phase has no gate with this key.']);
        }
        return $this->phases->requestGate($project, $project, $gate, $request->user());
    }
    public function setRiskClass(SetRiskClassRequest $request, Project $project) {
        $previous = $project->flow_risk_class_id;
        $project->forceFill(['flow_risk_class_id' => $request->validated('flow_risk_class_id')])->save();
        AuditEntry::record($project, 'project.risk_class_changed', $request->user(), ['from' => $previous, 'to' => $project->flow_risk_class_id]);
        return $this->phase($project->fresh());
    }
}
