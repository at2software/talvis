<?php

namespace App\Flow\Listeners;

use App\Flow\Events\ApprovalDecided;
use App\Flow\JobStateMachine;
use App\Flow\Models\Job;

class ResumeJobAfterGate {
    public function __construct(private readonly JobStateMachine $jobs) {}

    public function handle(ApprovalDecided $event): void {
        $approval = $event->approval;
        if ($approval->subject_type !== Job::class) {
            return;
        }
        $job = Job::find($approval->subject_id);
        if ($job?->state !== Job::AWAITING_GATE) {
            return;
        }
        $this->jobs->transition($job, $approval->isApproved() ? Job::RUNNING : Job::REJECTED, $approval->decidedBy, payload: ['approval_id' => $approval->id, 'gate_key' => $approval->gate_key]);
    }
}
