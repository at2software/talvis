<?php

namespace App\Flow\Listeners;

use App\Flow\ApprovalService;
use App\Flow\Events\ApprovalDecided;
use App\Flow\JobStateMachine;
use App\Flow\Models\Approval;
use App\Flow\Models\Job;
use Illuminate\Support\Facades\DB;

class AdvanceJobAfterDecision {
    public function __construct(private readonly JobStateMachine $jobs, private readonly ApprovalService $approvals) {}

    public function handle(ApprovalDecided $event): void {
        $approval = $event->approval;
        if ($approval->subject_type !== Job::class) {
            return;
        }
        DB::transaction(function () use ($approval) {
            $job = Job::whereKey($approval->subject_id)->lockForUpdate()->first();
            $to  = match (true) {
                $job?->state === Job::AWAITING_GATE && $approval->reviewRound() === null  => $this->afterGate($approval),
                $job?->state === Job::IN_REVIEW && $approval->reviewRound() !== null      => $this->afterReview($job, $approval),
                default                                                                   => null,
            };
            if ($to !== null) {
                $this->jobs->transition($job, $to, $approval->decidedBy, payload: array_filter([
                    'approval_id' => $approval->id,
                    'gate_key'    => $approval->gate_key,
                    'decision'    => $approval->decision,
                    'reason'      => $approval->decision === Approval::CHANGES_REQUESTED ? $approval->reason : null,
                ], fn ($value) => $value !== null));
            }
        });
    }
    private function afterGate(Approval $approval): string {
        return $approval->decision === Approval::REJECTED ? Job::REJECTED : Job::RUNNING;
    }
    private function afterReview(Job $job, Approval $approval): ?string {
        $round = $job->approvals()->get()->filter(fn (Approval $review) => $review->reviewRound() === $approval->reviewRound());
        if ($approval->isApproved()) {
            return $round->every(fn (Approval $review) => $review->isApproved()) ? Job::COMPLETED : null;
        }
        foreach ($round->filter(fn (Approval $review) => $review->isPending()) as $pending) {
            $this->approvals->withdraw($pending, $approval->decidedBy, "superseded by {$approval->decision} on approval #{$approval->id}");
        }
        return $approval->decision === Approval::REJECTED ? Job::REJECTED : Job::RUNNING;
    }
}
