<?php

namespace App\Actions\User;

use App\Enums\VacationState;
use App\Models\User;
use Illuminate\Support\Collection;

class CalculateUserWorkloadStats {
    public function execute(User $user, array $workData, array $holidays): array {
        $hpwArray = $user->getHpwArray();

        $vacations = ($workData['vacation_start'] ?? collect())
            ->concat($workData['vacation_end'] ?? collect())
            ->unique('id');

        $vacationDays = $this->expandVacationDays($vacations->where('state', VacationState::Approved));
        $sickDays     = $this->expandVacationDays($vacations->where('state', VacationState::Sick));

        $data     = $workData['data'] ?? collect();
        $startDay = strtotime($data->min('key') ?? now()->subDays(28)->format('Y-m-d'));
        $endDay   = strtotime('yesterday midnight');

        $cday         = $startDay;
        $workloadData = [];
        $workMap      = $data->keyBy('key');

        while ($cday <= $endDay) {
            $dayString      = date('Y-m-d', $cday);
            $duration       = $workMap->get($dayString)?->value ?? 0;
            $workloadData[] = $this->calculateDayWorkload($cday, $duration, $holidays, $vacationDays, $sickDays, $hpwArray);
            $cday           = strtotime('+1 day', $cday);
        }

        $workingHoursTotal  = array_reduce($workloadData, fn ($carry, $_) => $carry + $_['value'], 0);
        $requiredHoursTotal = array_reduce($workloadData, fn ($carry, $_) => $carry + $_['required'], 0);

        $hpw = $user->getHpw();
        if ($requiredHoursTotal > 0) {
            $average = round($hpw * $workingHoursTotal / $requiredHoursTotal, 1);
        } else {
            $average = 0;
        }

        $averageClass = 'average-okay';
        if ($average < $hpw * 0.9) {
            $averageClass = 'average-warning';
        }
        if ($average < $hpw * 0.8) {
            $averageClass = 'average-danger';
        }
        return [
            'workinfo'     => $workloadData,
            'average'      => $average,
            'averageClass' => $averageClass,
        ];
    }
    private function calculateDayWorkload(int $day, float $duration, array $holidays, array $vacationDays, array $sickDays, array $hpwArray): array {
        $class     = 'work-bar-default';
        $dayString = date('Y-m-d', $day);
        $dayOfWeek = (int)date('N', $day);

        $req = $hpwArray[($dayOfWeek - 1) % 7] ?? 0;

        if ($dayOfWeek >= 6) {
            $class = 'work-bar-weekend';
            $req   = 0;
        } elseif (in_array($dayString, $holidays)) {
            $class = 'work-bar-holiday';
            $req   = 0;
        } elseif (in_array($dayString, $sickDays)) {
            $class = 'work-bar-sick';
            $req   = 0;
        } elseif (in_array($dayString, $vacationDays)) {
            $class = 'work-bar-vacation';
            $req   = 0;
        } elseif ($req > 0 && $duration < (0.95 * $req)) {
            $class = 'work-bar-danger';
        }
        return [
            'key'      => $dayString,
            'day'      => date('d.m.Y', $day),
            'value'    => $duration,
            'class'    => $class,
            'required' => $req,
        ];
    }
    private function expandVacationDays(Collection $vacations): array {
        $days = [];
        foreach ($vacations as $vacation) {
            if (! $vacation->started_at || ! $vacation->ended_at) {
                continue;
            }
            $cursor = $vacation->started_at->copy()->startOfDay();
            $end    = $vacation->ended_at->copy()->startOfDay();
            while ($cursor <= $end) {
                $days[] = $cursor->format('Y-m-d');
                $cursor->addDay();
            }
        }
        return array_values(array_unique($days));
    }
}
