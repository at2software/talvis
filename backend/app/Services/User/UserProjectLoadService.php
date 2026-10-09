<?php

namespace App\Services\User;

use App\Models\Assignment;
use App\Models\Company;
use App\Models\Param;
use App\Models\User;
use App\Services\UserTimelineService;

class UserProjectLoadService {
    public function build(User $user): array {
        $meId      = Param::get('ME_ID')->value;
        $meCompany = Company::find($meId);

        if ($meCompany && ! $user->assigned_companies()->where('companies.id', $meId)->exists()) {
            $meCompany->addAssignee($user);
        }

        $ae = $user->activeEmployment;
        if (! $ae) {
            return [
                'user'             => $user,
                'hpw'              => 0,
                'remaining_hpw'    => 0,
                'subscriptions'    => [],
                'weekly_ids'       => [],
                'timeline_planned' => [],
                'timeline_leaves'  => [],
            ];
        }

        $activeSubscriptions = collect([...$user->activeProjects()->with('company')->get(), ...$user->assigned_companies()->get()])->unique();

        $activeSubscriptions->each(function ($subscription) {
            if ($subscription->pivot && $subscription->pivot->id) {
                $assignment = Assignment::find($subscription->pivot->id);
                if ($assignment) {
                    $subscription->pivot->avg_hpd = $assignment->avg_hpd;
                }
            }
        });

        $weeklySubscriptions  = $activeSubscriptions->filter(fn ($_) => $_->pivot->hours_weekly > 0);
        $plannedSubscriptions = $activeSubscriptions->filter(fn ($_) => $_->pivot->hours_planned > 0);
        $weeklyHpw            = $weeklySubscriptions->reduce(fn ($a, $b) => $a + $b->pivot->hours_weekly, 0);
        $remainingHpw         = $ae->hpw - $weeklyHpw;

        $timelineService = new UserTimelineService;
        $timelineLeaves  = $timelineService->generate($user, null, 40, true);

        if ($remainingHpw > 0) {
            $timeline        = $timelineService->generate($user, $plannedSubscriptions, $remainingHpw);
            $timelinePlanned = array_values(array_filter($timeline, fn ($_) => $_['type'] == 'Project' || $_['type'] == 'Company'));
        } else {
            $timelinePlanned = [];
        }

        return [
            'user'             => $user,
            'hpw'              => $ae->hpw,
            'remaining_hpw'    => $remainingHpw,
            'subscriptions'    => $activeSubscriptions,
            'weekly_ids'       => $weeklySubscriptions->map(fn ($_) => ['type' => $_->class, 'id' => $_->id])->values(),
            'timeline_planned' => $timelinePlanned,
            'timeline_leaves'  => $timelineLeaves,
        ];
    }
}
