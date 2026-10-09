<?php

namespace App\Queries;

use App\Models\Project;
use App\Models\User;
use App\Models\UserPaidTime;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class TimeBasedEmploymentQuery {
    public function getInfo(User $user): ?array {
        if (! $user->activeEmployment || ! $user->activeEmployment->is_time_based) {
            return null;
        }

        $projects = [];
        $orga     = 0;
        $query    = $this->employmentFoci($user)
            ->select('parent_type', 'parent_id', DB::raw('sum(duration) as duration'))
            ->groupBy('parent_type', 'parent_id')
            ->with('parent');

        foreach ($query->get() as $focus) {
            if ($parent = $focus->parent) {
                $parent           = json_decode(json_encode($parent));
                $parent->duration = $focus->duration;
                $projects[]       = $parent;
            } else {
                $orga += $focus->duration;
            }
        }

        $user->duration = $orga;
        $projects[]     = json_decode(json_encode($user));
        usort($projects, fn ($a, $b) => $b->duration - $a->duration);
        return $projects;
    }
    public function getTable(User $user): ?array {
        if (! $user->activeEmployment || ! $user->activeEmployment->is_time_based) {
            return null;
        }

        $query = $this->employmentFoci($user)
            ->select('parent_type', 'parent_id', DB::raw("DATE_FORMAT(started_at, '%Y-%m') AS month"), DB::raw('sum(duration) as duration'))
            ->groupBy('parent_type', 'parent_id', 'month')
            ->with('parent');

        $times = [];
        foreach ($query->get() as $focusData) {
            if (! isset($times[$focusData->month])) {
                $times[$focusData->month] = ['month' => $focusData->month, 'duration' => 0, 'type' => 0, 'excluded' => 0];
            }
            if ($focusData->parent instanceof Project && $focusData->parent->exclude_from_tbe) {
                $times[$focusData->month]['excluded'] += $focusData->duration;
            } else {
                $times[$focusData->month]['duration'] += $focusData->duration;
            }
        }
        $times = array_values($times);

        $paidQuery = $user->timePayments();
        $paidQuery->whereDate('paid_at', '>', $user->activeEmployment->started_at);
        if ($user->activeEmployment->ended_at) {
            $paidQuery->whereDate('paid_at', '<', $user->activeEmployment->ended_at);
        }
        $paidQuery->oldest('paid_at');

        $paid = $paidQuery->get()->map(fn (UserPaidTime $payment) => [
            'type'               => 1,
            'month'              => Carbon::parse($payment->paid_at)->format('Y-m'),
            'raw'                => $payment->raw,
            'vacation'           => $payment->vacation,
            'description'        => $payment->description,
            'granted_by_user_id' => $payment->granted_by_user_id,
        ]);

        $data = array_merge($times, $paid->all());
        usort($data, fn ($a, $b) => strcmp($a['month'], $b['month']));
        return $data;
    }
    private function employmentFoci(User $user): HasMany {
        $employment = $user->activeEmployment;
        return $user->foci()
            ->whereDate('started_at', '>', $employment->started_at)
            ->when($employment->ended_at, fn ($_) => $_->whereDate('started_at', '<', $employment->ended_at));
    }
}
