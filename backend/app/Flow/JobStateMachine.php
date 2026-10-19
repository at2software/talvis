<?php

namespace App\Flow;

use App\Flow\Exceptions\JobTransitionRefused;
use App\Flow\Models\AuditEntry;
use App\Flow\Models\Job;
use App\Flow\Models\Machine;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Support\Facades\DB;

class JobStateMachine {
    public const TRANSITIONS = [
        Job::OPEN          => [Job::CLAIMED, Job::REJECTED],
        Job::CLAIMED       => [Job::RUNNING, Job::AWAITING_GATE, Job::IN_REVIEW, Job::FAILED, Job::OPEN],
        Job::RUNNING       => [Job::AWAITING_GATE, Job::IN_REVIEW, Job::FAILED, Job::OPEN],
        Job::AWAITING_GATE => [Job::RUNNING, Job::REJECTED, Job::FAILED],
        Job::IN_REVIEW     => [Job::COMPLETED, Job::REJECTED, Job::RUNNING, Job::FAILED],
        Job::COMPLETED     => [],
        Job::FAILED        => [],
        Job::REJECTED      => [],
    ];

    public static function allows(string $from, string $to): bool {
        return in_array($to, self::TRANSITIONS[$from] ?? [], true);
    }
    public function create(array $attributes, ?Authenticatable $actor): Job {
        $job = Job::create([...$attributes, 'state' => Job::OPEN]);
        AuditEntry::record($job, 'job.created', $actor, ['type' => $job->type, 'project_id' => $job->project_id]);
        return $job;
    }
    public function claim(Job $job, Machine $machine): Job {
        $tokenName = $machine->tokenName();
        $claimed   = Job::whereKey($job->id)->where('state', Job::OPEN)->update([
            'state'      => Job::CLAIMED,
            'claimed_by' => $tokenName,
            'claimed_at' => now(),
            'updated_at' => now(),
        ]);
        if ($claimed !== 1) {
            throw JobTransitionRefused::alreadyClaimed($job->fresh());
        }
        $job = $job->fresh();
        AuditEntry::record($job, 'job.claimed', $machine, ['from' => Job::OPEN, 'to' => Job::CLAIMED, 'claimed_by' => $tokenName]);
        return $job;
    }
    public function transition(Job $job, string $to, ?Authenticatable $actor, array $changes = [], array $payload = []): Job {
        return DB::transaction(function () use ($job, $to, $actor, $changes, $payload) {
            $job  = Job::whereKey($job->id)->lockForUpdate()->firstOrFail();
            $from = $job->state;
            if (! self::allows($from, $to)) {
                throw JobTransitionRefused::notAllowed($from, $to);
            }
            $job->update([...$changes, 'state' => $to]);
            AuditEntry::record($job, "job.{$to}", $actor, ['from' => $from, 'to' => $to, ...$payload]);
            return $job;
        });
    }
    public function releaseStaleClaim(Job $job, CarbonInterface $idleSince): ?Job {
        return DB::transaction(function () use ($job, $idleSince) {
            $job = Job::whereKey($job->id)->lockForUpdate()->first();
            if (! $job || ! in_array($job->state, Job::HELD_BY_CLAIM, true) || $job->updated_at->gt($idleSince)) {
                return null;
            }
            return $this->transition($job, Job::OPEN, null, ['claimed_by' => null, 'claimed_at' => null], ['reason' => 'claim_ttl', 'claimed_by' => $job->claimed_by]);
        });
    }
}
