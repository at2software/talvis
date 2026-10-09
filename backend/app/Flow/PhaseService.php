<?php

namespace App\Flow;

use App\Flow\Models\Approval;
use App\Flow\Models\Gate;
use App\Flow\Models\Job;
use App\Flow\Models\Phase;
use App\Models\Project;
use App\Models\ProjectProjectState;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

class PhaseService {
    public function __construct(private readonly ApprovalService $approvals) {}

    public function currentPhase(Project $project): ?Phase {
        return Phase::forState($project->state?->id);
    }
    public function riskLevel(Project $project): int {
        return (int)$project->flowRiskClass?->level;
    }
    public function requiredApprovals(Gate $gate, Project $project): int {
        return $gate->required_approvals ?? $project->flowRiskClass?->release_required_approvals ?? 1;
    }
    public function enteredCurrentStateAt(Project $project): ?CarbonInterface {
        return ProjectProjectState::where('project_id', $project->id)->latest('id')->value('created_at');
    }
    public function gateStatus(Project $project, Phase $phase): Collection {
        $riskLevel = $this->riskLevel($project);
        $since     = $this->enteredCurrentStateAt($project);
        return $phase->gates->map(function (Gate $gate) use ($project, $riskLevel, $since) {
            $required = $this->requiredApprovals($gate, $project);
            return [
                'key'                 => $gate->key,
                'name'                => $gate->name,
                'required_role'       => $gate->required_role,
                'required_approvals'  => $required,
                'condition'           => $gate->condition,
                'applies'             => GateCondition::applies($gate->condition, $riskLevel),
                'satisfied'           => $this->approvalsFor($project, $gate->key, $since)->approved()->where('required_approvals', '>=', $required)->exists(),
                'pending_approval_id' => $this->approvalsFor($project, $gate->key, $since)->pending()->latest('id')->value('id'),
            ];
        });
    }
    public function missingGates(Project $project, Phase $phase): Collection {
        return $this->gateStatus($project, $phase)->filter(fn ($gate) => $gate['applies'] && ! $gate['satisfied'])->values();
    }
    public function requestGate(Model $subject, Project $project, Gate $gate, ?Authenticatable $requester, array $context = []): Approval {
        return $this->approvals->request($subject, $gate->required_role, $requester, $this->requiredApprovals($gate, $project), $gate->key, $context);
    }
    public function gateInCurrentPhase(Project $project, string $gateKey): ?Gate {
        return $this->currentPhase($project)?->gates()->where('key', $gateKey)->first();
    }
    private function approvalsFor(Project $project, string $gateKey, ?CarbonInterface $since): Builder {
        return Approval::query()
            ->where('gate_key', $gateKey)
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $q) => $q->where('subject_type', Project::class)->where('subject_id', $project->id))
                ->orWhere(fn (Builder $q) => $q->where('subject_type', Job::class)->whereIn('subject_id', Job::where('project_id', $project->id)->select('id'))))
            ->when($since, fn (Builder $q) => $q->where('created_at', '>=', $since));
    }
}
