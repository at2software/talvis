<?php

namespace App\Services;

use App\Enums\InvoiceItemType;
use App\Enums\MilestoneState;
use App\Models\Assignment;
use App\Models\ProjectState;
use Illuminate\Support\Facades\Auth;

class TimetrackerDataService {
    const GLOBAL_LOADERS  = ['id', 'name', 'color', 'latest_focus', 'target', 'is_subscribed', 'icon', 'company_name'];
    const PROJECT_LOADERS = ['progress', 'hours_invested'];
    const TARGET_PROJECT  = 'project_id';
    const TARGET_COMPANY  = 'company_id';

    public function mapProjects($collection): array {
        return $collection
            ->with('latest_focus', 'pluginLinks', 'hoursInvestedSum')
            ->get()
            ->filter(function ($_) {
                $_->is_in_warranty = $_->isInWarranty();
                return $_->state->progress < ProjectState::Finished || $_->is_in_warranty;
            })
            ->map(function ($_) {
                foreach (self::PROJECT_LOADERS as $key) {
                    $_->{$key};
                }
                $_->latest_focus       = $_->latest_focus ? $_->latest_focus->only(['started_at', 'comment']) : null;
                $_->is_project         = true;
                $_->needs_progress_bar = ! $_->is_time_based && ! $_->is_internal;
                $_->target             = self::TARGET_PROJECT;
                if (! $_->is_time_based) {
                    $_->items = $_->invoiceItems()->whereType(InvoiceItemType::Default)->with('milestones:id,state,name,started_at')->get()
                        ->reject(fn ($item) => $item->milestones->isNotEmpty() &&
                            $item->milestones->every(fn ($milestone) => ($milestone->started_at && $milestone->started_at->isFuture()) ||
                                $milestone->state == MilestoneState::DONE
                            )
                        )
                        ->values()
                        ->map(function ($item) {
                            return $item->only(['id', 'text', 'foci_sum', 'assumed_workload', 'milestones']);
                        });
                }
                $_->is_internal   = $_->is_internal ? 1 : 0;
                $_->is_time_based = $_->is_time_based ? 1 : 0;
                $_->is_subscribed = Assignment::whereParentAndAssignee($_, Auth::user())->exists();

                if ($assignment = Assignment::whereParentAndAssignee($_, request()->user())->first()) {
                    $_->hours_planned = $assignment->hours_planned;
                }
                return $_;
            })
            ->map->only([...self::GLOBAL_LOADERS, ...self::PROJECT_LOADERS,
                'project_manager_id', 'due_at', 'deadline_at', 'pluginLinks', 'needs_progress_bar',
                'state', 'finished_state', 'progress', 'is_internal', 'is_time_based', 'items', 'work_estimated', 'hours_planned', 'has_time_budget',
                'is_in_warranty', 'warranty_until'])
            ->all();
    }
    public function mapCompanies($collection): array {
        return $collection
            ->with('latest_focus')
            ->get()
            ->map(function ($_) {
                $_->color         = $_->accepts_support ? '#00C9A7' : '#FF6700';
                $_->is_project    = false;
                $_->company_name  = ($_->accepts_support ? 'Support' : 'Unbezahlt');
                $_->target        = self::TARGET_COMPANY;
                $_->latest_focus  = $_->latest_focus ? $_->latest_focus->only(['started_at', 'comment']) : null;
                $_->is_subscribed = count(request()->user()->assigned_companies->filter(fn ($company) => $company->id == $_->id)) > 0;

                if ($assignment = Assignment::whereParentAndAssignee($_, request()->user())->first()) {
                    $_->hours_planned = $assignment->hours_planned;
                }
                return $_;
            })
            ->map->only([...self::GLOBAL_LOADERS, 'hours_planned', 'has_time_budget'])
            ->all();
    }
}
