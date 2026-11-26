<?php

namespace App\Events;

use App\Http\Controllers\PluginGitController;
use App\Models\Project;
use Illuminate\Support\Collection;

class SecurityReportReceived {
    /**
     * @param Collection<int, Project> $projects
     */
    public function __construct(
        public readonly PluginGitController $git,
        public readonly Collection $projects,
        public readonly array $gitProject,
        public readonly int $pipelineId,
        public readonly string $ref,
        public readonly array $report,
    ) {}
}
