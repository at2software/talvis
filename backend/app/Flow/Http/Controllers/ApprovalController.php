<?php

namespace App\Flow\Http\Controllers;

use App\Flow\ApprovalService;
use App\Flow\Http\Requests\ApproveRequest;
use App\Flow\Http\Requests\RejectRequest;
use App\Flow\Models\Approval;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ApprovalController extends Controller {
    public function index(Request $request) {
        return Approval::decidableBy($request->user())
            ->with('subject', 'requestedBy', 'votes.user')
            ->latest('id')
            ->get()
            ->each->append(['subject_label', 'subject_link']);
    }
    public function approve(ApproveRequest $request, Approval $approval, ApprovalService $approvals) {
        return $this->present($approvals->approve($approval, $request->user(), $request->validated('reason'), $request->validated('selected_option')));
    }
    public function reject(RejectRequest $request, Approval $approval, ApprovalService $approvals) {
        return $this->present($approvals->reject($approval, $request->user(), $request->validated('reason')));
    }
    public function requestChanges(RejectRequest $request, Approval $approval, ApprovalService $approvals) {
        return $this->present($approvals->requestChanges($approval, $request->user(), $request->validated('reason')));
    }
    private function present(Approval $approval): Approval {
        return $approval->load('subject', 'requestedBy', 'votes.user')->append(['subject_label', 'subject_link']);
    }
}
