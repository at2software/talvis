<?php

namespace App\Events;

use App\Models\Project;
use App\Models\ProjectState;
use App\Models\User;

class ProjectStateTransitioning {
    private ?string $rejection = null;

    public function __construct(
        public readonly Project $project,
        public readonly ProjectState $from,
        public readonly ProjectState $to,
        public readonly User $actor,
        public readonly ?string $reason = null,
    ) {}

    public function reject(string $reason): void {
        $this->rejection ??= $reason;
    }
    public function rejection(): ?string {
        return $this->rejection;
    }
}
