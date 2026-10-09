<?php

namespace App\Queries;

use App\Models\Company;
use App\Models\Project;
use Illuminate\Support\Collection;

class ProjectSuccessQuoteQuery {
    public function __construct(private ?Company $company = null) {}

    public function get(): array {
        $query = $this->company ? $this->company->projects() : Project::query();

        $finishedProjects = $this->getFinishedProjects($query);
        $startedProjects  = $this->getStartedProjects($query);
        return $finishedProjects->merge($startedProjects)
            ->filter(fn ($item) => $item['date'])
            ->sortByDesc('date')
            ->values()
            ->toArray();
    }
    public function getCurrentPercentage(): float {
        $all        = $this->get();
        $successful = 0;

        if (count($all)) {
            foreach ($all as $total => $item) {
                $successful += $item['value'];
            }
            return $successful / ($total + 1) * 100;
        }
        return 0;
    }
    private function getFinishedProjects($query): Collection {
        return $query->clone()
            ->whereHasDesicion()
            ->whereHas('lastFinishedState')
            ->with(['lastFinishedState' => fn ($q) => $q->withTimestamps()])
            ->get()
            ->toBase()
            ->map(function ($project) {
                $state = $project->lastFinishedState->first();
                return [
                    'date'  => $state->pivot->created_at,
                    'value' => $state->is_successful ? 1 : 0,
                ];
            });
    }
    private function getStartedProjects($query): Collection {
        return $query->clone()
            ->whereHasDesicion()
            ->whereDoesntHave('lastFinishedState')
            ->whereHas('firstStartedState')
            ->with(['firstStartedState' => fn ($q) => $q->withTimestamps()])
            ->get()
            ->toBase()
            ->map(function ($project) {
                $state = $project->firstStartedState->first();
                return [
                    'date'  => $state->pivot->created_at,
                    'value' => 1,
                ];
            });
    }
}
