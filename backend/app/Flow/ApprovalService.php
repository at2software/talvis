<?php

namespace App\Flow;

use App\Flow\Events\ApprovalDecided;
use App\Flow\Events\ApprovalRequested;
use App\Flow\Exceptions\ApprovalRefused;
use App\Flow\Models\Approval;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Job;
use App\Flow\Models\Machine;
use App\Models\User;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class ApprovalService {
    public function request(Model $subject, string $requiredRole, ?Authenticatable $requester, int $requiredApprovals = 1, ?string $gateKey = null, array $context = []): Approval {
        if ($requiredApprovals < 1) {
            throw new InvalidArgumentException('An approval needs at least one approver.');
        }
        if ($requester instanceof Machine) {
            $context['requested_by_machine'] = $requester->tokenName() ?? $requester->name;
        }
        $approval = Approval::create([
            'subject_type'       => $subject::class,
            'subject_id'         => $subject->getKey(),
            'gate_key'           => $gateKey,
            'requested_by_id'    => $requester instanceof User ? $requester->id : null,
            'required_role'      => $requiredRole,
            'required_approvals' => $requiredApprovals,
            'decision'           => Approval::PENDING,
            'context'            => $context ?: null,
        ]);
        AuditEntry::record($approval, 'approval.requested', $requester, [
            'subject_type'       => $approval->subject_type,
            'subject_id'         => $approval->subject_id,
            'gate_key'           => $gateKey,
            'required_role'      => $requiredRole,
            'required_approvals' => $requiredApprovals,
        ]);
        event(new ApprovalRequested($approval));
        return $approval;
    }
    public function approve(Approval $approval, User $decider, ?string $reason = null, ?string $selectedOption = null): Approval {
        return $this->decide($approval, $decider, Approval::APPROVED, $reason, $selectedOption);
    }
    public function reject(Approval $approval, User $decider, ?string $reason = null): Approval {
        return $this->decide($approval, $decider, Approval::REJECTED, $reason, null);
    }
    public function requestChanges(Approval $approval, User $decider, string $reason): Approval {
        return $this->decide($approval, $decider, Approval::CHANGES_REQUESTED, $reason, null);
    }
    public function withdraw(Approval $approval, ?Authenticatable $actor, string $reason): void {
        DB::transaction(function () use ($approval, $actor, $reason) {
            $approval = Approval::whereKey($approval->getKey())->lockForUpdate()->firstOrFail();
            if (! $approval->isPending()) {
                return;
            }
            $approval->update(['decision' => Approval::WITHDRAWN, 'decided_at' => now(), 'reason' => $reason]);
            AuditEntry::record($approval, 'approval.withdrawn', $actor, ['reason' => $reason]);
        });
    }
    public function isSatisfied(Approval $approval): bool {
        return $approval->fresh()->isApproved();
    }
    private function decide(Approval $approval, User $decider, string $decision, ?string $reason, ?string $selectedOption): Approval {
        $approval = DB::transaction(function () use ($approval, $decider, $decision, $reason, $selectedOption) {
            $approval = Approval::whereKey($approval->getKey())->lockForUpdate()->firstOrFail();
            $this->assertMayDecide($approval, $decider, $decision, $selectedOption);

            $approval->votes()->create([
                'user_id'         => $decider->id,
                'decision'        => $decision,
                'reason'          => $reason,
                'selected_option' => $selectedOption,
            ]);
            AuditEntry::record($approval, 'approval.voted', $decider, ['decision' => $decision, 'reason' => $reason, 'selected_option' => $selectedOption]);

            $approvals = $approval->votes()->where('decision', Approval::APPROVED)->count();
            if ($decision !== Approval::APPROVED || $approvals >= $approval->required_approvals) {
                $approval->update([
                    'decision'        => $decision,
                    'decided_by_id'   => $decider->id,
                    'decided_at'      => now(),
                    'reason'          => $reason,
                    'selected_option' => $selectedOption ?? $approval->selected_option,
                ]);
                AuditEntry::record($approval, "approval.{$decision}", $decider, ['reason' => $reason, 'approvals' => $approvals]);
            }
            return $approval;
        });

        if (! $approval->isPending()) {
            event(new ApprovalDecided($approval));
        }
        return $approval;
    }
    private function assertMayDecide(Approval $approval, User $decider, string $decision, ?string $selectedOption): void {
        if (! $approval->isPending()) {
            throw ApprovalRefused::notPending();
        }
        if ($decision === Approval::CHANGES_REQUESTED && $approval->subject_type !== Job::class) {
            throw ApprovalRefused::changesNotApplicable();
        }
        if ($approval->requested_by_id !== null && $approval->requested_by_id === $decider->id) {
            throw ApprovalRefused::ownRequest();
        }
        if (! $decider->hasAnyRole([$approval->required_role])) {
            throw ApprovalRefused::missingRole($approval->required_role);
        }
        if ($approval->votes()->where('user_id', $decider->id)->exists()) {
            throw ApprovalRefused::alreadyVoted();
        }
        if ($selectedOption !== null && ! in_array($selectedOption, $approval->options(), true)) {
            throw ApprovalRefused::unknownOption();
        }
    }
}
