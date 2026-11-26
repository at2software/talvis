<?php

namespace App\Support;

use App\Models\Project;

interface ProjectOrchestrator {
    public function orchestrates(Project $project): bool;

    /** @return list<int> */
    public function orchestratedStateIds(): array;

    /** @return list<array{title: string, hint: string, icon: string, url: string}> */
    public function chatHeaderLinks(Project $project): array;
}
