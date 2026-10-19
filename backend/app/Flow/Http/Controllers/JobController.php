<?php

namespace App\Flow\Http\Controllers;

use App\Flow\ApprovalService;
use App\Flow\Exceptions\JobTransitionRefused;
use App\Flow\GateCondition;
use App\Flow\Http\Requests\FailJobRequest;
use App\Flow\Http\Requests\GateRequestRequest;
use App\Flow\Http\Requests\IndexJobsRequest;
use App\Flow\Http\Requests\JobResultRequest;
use App\Flow\Http\Resources\JobResource;
use App\Flow\JobStateMachine;
use App\Flow\Models\Approval;
use App\Flow\Models\Gate;
use App\Flow\Models\Job;
use App\Flow\Models\Machine;
use App\Flow\PhaseService;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class JobController extends Controller {
    public function __construct(private readonly JobStateMachine $jobs, private readonly PhaseService $phases, private readonly ApprovalService $approvals) {}

    public function index(IndexJobsRequest $request) {
        $state     = $request->validated('state') ?? Job::OPEN;
        $claimedBy = $request->validated('claimed_by') ?? (in_array($state, Job::HELD_BY_CLAIM, true) ? $request->user()->tokenName() : null);
        return JobResource::collection(Job::withProjectSummary()
            ->inState($state)
            ->when($request->validated('type'), fn ($q, $type) => $q->where('type', $type))
            ->when($claimedBy, fn ($q, $name) => $q->where('claimed_by', $name))
            ->oldest('id')
            ->limit($request->validated('limit') ?? 50)
            ->get())->resolve();
    }
    public function show(Job $job) {
        return new JobResource($this->withSummary($job)->load('approvals'));
    }
    public function claim(Request $request, Job $job) {
        return new JobResource($this->withSummary($this->jobs->claim($job, $request->user())));
    }
    public function gateRequest(GateRequestRequest $request, Job $job) {
        $machine = $this->claimedBy($request, $job);
        $gate    = $this->phases->gateInCurrentPhase($job->project, $request->validated('gate_key'));
        if (! $gate) {
            throw ValidationException::withMessages(['gate_key' => 'The project\'s current phase has no gate with this key.']);
        }
        return DB::transaction(function () use ($request, $job, $machine, $gate) {
            $job      = $this->jobs->transition($job, Job::AWAITING_GATE, $machine, payload: ['gate_key' => $gate->key]);
            $approval = $this->phases->requestGate($job, $job->project, $gate, $machine, array_filter([
                'job_id'         => $job->id,
                'options'        => $request->validated('options'),
                'recommendation' => $request->validated('recommendation'),
                'source'         => $request->validated('source'),
                'diff_url'       => $request->validated('diff_url'),
            ], fn ($value) => $value !== null));
            return ['job' => new JobResource($this->withSummary($job)), 'approval' => $approval];
        });
    }
    public function gates(Job $job) {
        return $job->approvals()->withCount('votes')->get()->map(fn ($approval) => [
            'id'                 => $approval->id,
            'gate_key'           => $approval->gate_key,
            'decision'           => $approval->decision,
            'selected_option'    => $approval->selected_option,
            'reason'             => $approval->reason,
            'required_approvals' => $approval->required_approvals,
            'votes'              => $approval->votes_count,
            'decided_at'         => $approval->decided_at,
            'review_round'       => $approval->reviewRound(),
        ]);
    }
    public function result(JobResultRequest $request, Job $job) {
        $machine = $this->claimedBy($request, $job);
        return DB::transaction(function () use ($request, $job, $machine) {
            $job = $this->jobs->transition($job, Job::IN_REVIEW, $machine, [
                'output'    => [...($job->output ?? []), 'mr_url' => $request->validated('mr_url'), 'mr_urls' => $request->validated('mr_urls'), 'test_report' => $request->validated('test_report')],
                'metrics'   => $request->validated('metrics'),
                'knowledge' => $request->validated('knowledge'),
            ], array_filter(['mr_url' => $request->validated('mr_url'), 'mr_urls' => $request->validated('mr_urls')]));

            $reviews = $this->requestReviews($job, $machine);
            if ($reviews->isEmpty()) {
                $job = $this->jobs->transition($job, Job::COMPLETED, $machine, payload: ['reason' => 'no_review_gates']);
            }
            return ['job' => new JobResource($this->withSummary($job)), 'review_approvals' => $reviews];
        });
    }
    public function fail(FailJobRequest $request, Job $job) {
        $machine = $this->claimedBy($request, $job);
        return DB::transaction(function () use ($request, $job, $machine) {
            $job = $this->jobs->transition($job, Job::FAILED, $machine, [
                'output' => [...($job->output ?? []), 'failure_reason' => $request->validated('reason')],
            ], ['reason' => $request->validated('reason')]);
            foreach ($job->approvals()->pending()->get() as $approval) {
                $this->approvals->withdraw($approval, $machine, 'job failed');
            }
            return new JobResource($this->withSummary($job));
        });
    }
    private function requestReviews(Job $job, Machine $machine): Collection {
        $round     = 1 + (int)$job->approvals()->get()->max(fn (Approval $approval) => $approval->reviewRound());
        $riskLevel = $this->phases->riskLevel($job->project);
        return collect($job->jobType?->review_gate_keys ?? [])
            ->map(fn (string $key) => $this->phases->gateInCurrentPhase($job->project, $key))
            ->filter(fn (?Gate $gate) => $gate && GateCondition::applies($gate->condition, $riskLevel))
            ->map(fn (Gate $gate) => $this->phases->requestGate($job, $job->project, $gate, $machine, ['job_id' => $job->id, 'review_round' => $round]))
            ->values();
    }
    private function withSummary(Job $job): Job {
        return $job->load(['project' => fn ($q) => $q->withoutEagerLoads()->select('id', 'name')]);
    }
    private function claimedBy(Request $request, Job $job): Machine {
        $machine = $request->user();
        if (! $job->isClaimedBy($machine->tokenName())) {
            throw JobTransitionRefused::notYours();
        }
        return $machine;
    }
}
