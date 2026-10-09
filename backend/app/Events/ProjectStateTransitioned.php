<?php

namespace App\Events;

use App\Models\Project;
use App\Models\ProjectState;
use App\Models\User;

class ProjectStateTransitioned {
    public function __construct(
        public readonly Project $project,
        public readonly ProjectState $from,
        public readonly ProjectState $to,
        public readonly User $actor,
        public readonly ?string $reason = null,
    ) {}
}
