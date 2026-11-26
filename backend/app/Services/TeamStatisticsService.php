<?php

namespace App\Services;

use App\Models\Project;
use App\Models\User;

class TeamStatisticsService {
    public static function getTeamStatus() {
        return User::whereEmployed()
            ->with(['current_focus', 'activeVacations', 'active_sick_notes', 'activeEmployments'])
            ->get()
            ->map(function ($user) {
                $currentFocus = $user->current_focus ? [
                    'id'    => $user->current_focus->id,
                    'icon'  => $user->current_focus->icon,
                    'name'  => $user->current_focus->name,
                    'color' => $user->current_focus->color,
                    'class' => $user->current_focus->class,
                ] : null;
                if (is_a($user->current_focus, Project::class)) {
                    $currentFocus['is_time_based'] = $user->current_focus->is_time_based;
                    $currentFocus['is_internal']   = $user->current_focus->is_internal;
                }
                return [
                    'id'                  => $user->id,
                    'name'                => $user->name,
                    'email'               => $user->email,
                    'work_zip'            => $user->work_zip,
                    'availability_status' => $user->availability_status,
                    'is_sick'             => $user->is_sick,
                    'is_on_vacation'      => $user->is_on_vacation,
                    'current_focus'       => $currentFocus,
                    'activeVacations'     => $user->activeVacations->map(fn ($v) => [
                        'id'         => $v->id,
                        'started_at' => $v->started_at,
                        'ended_at'   => $v->ended_at,
                    ]),
                    'active_sick_notes' => $user->active_sick_notes->map(fn ($s) => [
                        'id'         => $s->id,
                        'started_at' => $s->started_at,
                        'ended_at'   => $s->ended_at,
                    ]),
                ];
            })->values();
    }
    public static function getTeamMonitorData() {
        $data = User::whereEmployed()
            ->with(['current_focus', 'vacations', 'activeVacations', 'active_sick_notes', 'activeEmployments'])
            ->get()
            ->append(['availability_status', 'is_sick', 'is_on_vacation']);

        foreach ($data as &$d) {
            $focusData       = $d->getFocusDisplayData();
            $d->focus_name   = $focusData['focus_name'];
            $d->focus_color  = $focusData['focus_color'];
            $d->availability = $focusData['availability'];
            $d->focus_icon   = $d->current_focus?->icon ?? null;

            $work              = WorkingTimeService::getWorkingTimeFor($d);
            $d->workinfo       = $work['workinfo'];
            $d->average        = $work['average'];
            $d->averageClass   = $work['averageClass'];
            $d->required_hours = $work['required_hours'];
        }
        return $data->sort(fn ($a, $b) => $b->availability_status - $a->availability_status)->values();
    }
}
