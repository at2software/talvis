<?php

namespace App\ML;

use App\Models\Project;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class ProjectCheckpointDataset {
    public const FEATURES = [
        'work_estimated',
        'hours_logged_so_far',
        'elapsed_days',
        'burn_rate',
        'pct_of_quote_used',
        'remaining_quote',
    ];
    public const LABEL                = 'remaining_hours';
    public const CHECKPOINT_FRACTIONS = [0.25, 0.5, 0.75];
    public const MIN_DURATION_DAYS    = 5;

    public static function eligibleProjects(): Collection {
        return ProjectDataset::eligibleProjects()
            ->filter(fn (Project $project) => $project->started_at && $project->finished_at)
            ->filter(fn (Project $project) => $project->started_at->diffInDays($project->finished_at) >= self::MIN_DURATION_DAYS)
            ->values()
            ->load('foci:id,parent_id,parent_type,started_at,duration');
    }

    /**
     * @param Collection<int, Project> $projects
     * @return list<array<string, mixed>>
     */
    public static function checkpointRows(Collection $projects): array {
        $rows = [];
        foreach ($projects as $project) {
            $foci = $project->foci
                ->filter(fn ($focus) => $focus->started_at !== null)
                ->sortBy('started_at');

            $totalHours  = (float)$project->hours_invested;
            $spanSeconds = $project->started_at->diffInSeconds($project->finished_at);

            foreach (self::CHECKPOINT_FRACTIONS as $fraction) {
                $checkpointAt = $project->started_at->copy()->addSeconds((int)($fraction * $spanSeconds));

                $hoursSoFar = (float)$foci
                    ->filter(fn ($focus) => $focus->started_at->lte($checkpointAt))
                    ->sum('duration');

                $rows[] = self::row($project, $checkpointAt, $hoursSoFar, $totalHours - $hoursSoFar);
            }
        }
        return $rows;
    }

    public static function currentRow(Project $project): ?array {
        if (! $project->started_at) {
            return null;
        }

        $foci = $project->foci()->get(['started_at', 'duration'])
            ->filter(fn ($focus) => $focus->started_at !== null);

        $hoursSoFar = (float)$foci->sum('duration');

        return self::row($project, now(), $hoursSoFar, null);
    }
    private static function row(Project $project, Carbon $checkpointAt, float $hoursSoFar, ?float $remainingHours): array {
        $elapsedDays   = max($project->started_at->diffInDays($checkpointAt, true), 1 / 24);
        $workEstimated = (float)$project->work_estimated;

        $row = [
            'project_id'          => $project->id,
            'work_estimated'      => $workEstimated,
            'hours_logged_so_far' => $hoursSoFar,
            'elapsed_days'        => $elapsedDays,
            'burn_rate'           => $hoursSoFar / $elapsedDays,
            'pct_of_quote_used'   => $workEstimated > 0 ? $hoursSoFar / $workEstimated : 0.0,
            'remaining_quote'     => $workEstimated - $hoursSoFar,
        ];
        if ($remainingHours !== null) {
            $row[self::LABEL] = max(0.0, $remainingHours);
        }
        return $row;
    }
    public static function logLabel(float $remainingHours): float {
        return log($remainingHours + 1);
    }
}
