<?php

namespace App\Support;

use App\Models\Project;

class NullProjectOrchestrator implements ProjectOrchestrator {
    public function orchestrates(Project $project): bool {
        return false;
    }
    public function orchestratedStateIds(): array {
        return [];
    }
    public function chatHeaderLinks(Project $project): array {
        return [];
    }
}
