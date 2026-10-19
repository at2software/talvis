<?php

namespace App\Flow\Console;

use App\Flow\JobStateMachine;
use App\Flow\Models\Job;
use Illuminate\Console\Command;

class ReleaseStaleClaims extends Command {
    protected $signature   = 'flow:release-stale-claims';
    protected $description = 'Put claimed or running flow jobs back to open when they have not moved for longer than flow.claim_ttl_hours.';

    public function handle(JobStateMachine $jobs): int {
        $idleSince = now()->subHours(config('flow.claim_ttl_hours'));
        $released  = 0;
        foreach (Job::whereIn('state', Job::HELD_BY_CLAIM)->where('updated_at', '<', $idleSince)->get() as $job) {
            if ($jobs->releaseStaleClaim($job, $idleSince)) {
                $released++;
            }
        }
        $this->info("Released {$released} stale claim(s).");
        return self::SUCCESS;
    }
}
