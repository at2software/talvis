<?php

namespace App\Events;

use App\Enums\VacationState;
use App\Models\User;
use App\Models\Vacation;

class VacationDecided {
    public function __construct(
        public readonly Vacation $vacation,
        public readonly VacationState $state,
        public readonly User $decider,
        public readonly ?string $reason = null,
    ) {}
}
