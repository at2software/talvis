<?php

namespace App\Services;

use App\Enums\VacationState;
use App\Http\Controllers\VacationController;
use App\Models\User;
use Carbon\CarbonPeriod;

class WorkingTimeService {
    public static function getWorkingTimeFor(User $user): array {
        $start = now()->subDays(28)->startOfDay();
        $end   = now()->endOfWeek();

        $vacationController = app(VacationController::class);
        $holidays           = array_map(fn ($_) => $_->datum, $vacationController->indexHolidays($user->work_zip));

        $fociData = $user->foci()
            ->whereBetween('started_at', [$start, $end])
            ->selectCluster('started_at', 'duration', '%Y-%m-%d')
            ->groupBy('key')
            ->get();

        $vacations = $user->vacations()
            ->where(function ($query) use ($start, $end) {
                $query->whereBetween('started_at', [$start, $end])
                    ->orWhereBetween('ended_at', [$start, $end]);
            })
            ->get();

        $vacationStart = $vacations->filter(fn ($v) => $v->started_at >= $start && $v->started_at <= $end);
        $vacationEnd   = $vacations->filter(fn ($v) => $v->ended_at >= $start && $v->ended_at <= $end);
        $payload       = [
            'data'           => $fociData,
            'holidays'       => $holidays,
            'vacation_start' => $vacationStart->values(),
            'vacation_end'   => $vacationEnd->values(),
        ];

        $workloadStats = $user->getWorkloadStats($payload, $holidays);
        $weeklyTotals  = self::getWeeklyTotals($user, $payload);
        return array_merge($payload, $workloadStats, [
            'required_hours'           => $user->getHpw(),
            'work_this_week'           => $weeklyTotals['work_this_week'],
            'required_work_this_week'  => $weeklyTotals['required_work_this_week'],
        ]);
    }
    private static function getWeeklyTotals(User $user, array $payload): array {
        $weekStart = now()->startOfWeek();
        $weekEnd   = now()->endOfWeek();

        $vacationDays = [];
        $vacations    = $payload['vacation_start']
            ->concat($payload['vacation_end'])
            ->unique('id')
            ->whereIn('state', VacationState::Absences);
        foreach ($vacations as $vacation) {
            if (! $vacation->started_at || ! $vacation->ended_at) {
                continue;
            }
            $cursor = $vacation->started_at->copy()->startOfDay();
            $end    = $vacation->ended_at->copy()->startOfDay();
            while ($cursor <= $end) {
                $vacationDays[] = $cursor->format('Y-m-d');
                $cursor->addDay();
            }
        }
        $vacationDays = array_unique($vacationDays);

        $workByDay = $payload['data']->keyBy('key');
        $hpwArray  = $user->getHpwArray();

        $workThisWeek     = 0.0;
        $requiredThisWeek = 0.0;

        foreach (CarbonPeriod::create($weekStart, $weekEnd) as $date) {
            $dayString  = $date->format('Y-m-d');
            $dayOfWeek  = (int)$date->format('N');
            $required   = $hpwArray[($dayOfWeek - 1) % 7] ?? 0;
            $isBreakDay = in_array($dayString, $vacationDays) || in_array($dayString, $payload['holidays']) || $dayOfWeek >= 6;

            $workThisWeek += (float)($workByDay->get($dayString)?->value ?? 0);
            if (! $isBreakDay) {
                $requiredThisWeek += (float)$required;
            }
        }

        return [
            'work_this_week'          => round($workThisWeek, 2),
            'required_work_this_week' => round($requiredThisWeek, 2),
        ];
    }
}
