<?php

namespace App\Queries;

use App\Enums\ClusterType;
use Carbon\Carbon;
use Closure;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class FociTimelineQuery {
    /** @param Closure $foci Returns a fresh Focus query/relation builder each call. */
    public function __construct(private Closure $foci) {}

    public function get(): Collection {
        [$min, $max, $cluster] = $this->getFociDateRange();
        $users                 = $this->getFociUsers();
        $data                  = $this->mapUsersToClusterData($users, $cluster);
        return $this->fillGapsInUserData($data, $min, $max, $cluster);
    }
    private function getFociDateRange(): array {
        $table = ($this->foci)()->getModel()->getTable();
        $range = ($this->foci)()->toBase()->select(
            DB::raw("MIN(`$table`.`started_at`) AS min_started"),
            DB::raw("MAX(`$table`.`started_at`) AS max_started"),
        )->first();

        $min     = Carbon::parse($range->min_started ?? null);
        $max     = Carbon::parse($range->max_started ?? null);
        $cluster = ClusterType::getType($min, $max);
        return [$min, $max, $cluster];
    }
    private function getFociUsers(): Collection {
        return ($this->foci)()->with('user')->groupBy('user_id')->get();
    }
    private function mapUsersToClusterData(Collection $users, ClusterType $cluster): Collection {
        $rows = ($this->foci)()
            ->whereIn('user_id', $users->pluck('user_id'))
            ->clusterBy('started_at', $cluster->toString(), sumColumn: 'duration')
            ->addSelect('user_id')
            ->groupBy('user_id')
            ->get()
            ->groupBy('user_id');

        return $users->map(fn ($_) => [
            'user' => $_->user->only(['name', 'color', 'id']),
            'data' => ($rows->get($_->user->id) ?? collect())
                ->map(fn ($x) => ['period' => $x->month, 'value' => (float)$x->sum]),
        ]);
    }
    private function fillGapsInUserData(Collection $data, Carbon $min, Carbon $max, ClusterType $cluster): Collection {
        $periods = $this->listPeriods($min, $max, $cluster);

        return $data->map(function ($user) use ($periods) {
            $values       = $user['data']->keyBy('period');
            $user['data'] = $periods->map(fn ($_) => $values[$_] ?? ['period' => $_, 'value' => 0.0]);
            return $user;
        });
    }
    private function listPeriods(Carbon $min, Carbon $max, ClusterType $cluster): Collection {
        $format  = $cluster->toCarbonFormat();
        $periods = collect();
        for ($date = Carbon::parse($min->format($format)); $date <= $max; $cluster->increase($date)) {
            $periods->push($date->format($format));
        }
        return $periods;
    }
}
