<?php

namespace App\Builders;

use App\Models\Project;
use App\Models\ProjectState;
use App\Traits\HasParamsBuilder;
use Illuminate\Support\Facades\DB;

class ProjectBuilder extends BaseBuilder {
    use HasParamsBuilder;

    public function whereState(...$args) {
        return $this->whereHas('latestState', fn ($q) => $q->where(...$args));
    }
    public function whereStateIn($ids) {
        return $this->whereHas('latestState', fn ($q) => $q->whereIn('project_states.id', $ids));
    }
    public function whereProgress($progress) {
        return $this->whereHas('latestState', fn ($q) => $q->where('progress', $progress));
    }
    public function wherePrepared() {
        return $this->whereProgress(ProjectState::Prepared);
    }
    public function wherePreparedOrRunning() {
        return $this->whereProgressIn([ProjectState::Prepared, ProjectState::Running]);
    }
    public function whereTrackable() {
        return $this->where(fn ($_) => $_
            ->whereProgressIn([ProjectState::Prepared, ProjectState::Running])
            ->orWhere(fn ($__) => $__->whereWithinWarrantyBound()));
    }
    public function whereWithinWarrantyBound() {
        return $this
            ->whereHas('latestState', fn ($_) => $_->where('progress', ProjectState::Finished)->where('is_successful', true))
            ->whereRelation('states', 'project_project_state.created_at', '>=', now()->subMonths(Project::maxWarrantyMonths()));
    }
    public function whereProgressIn(array $progress) {
        return $this->whereHas('latestState', fn ($q) => $q->whereIn('progress', $progress));
    }
    public function whereHasDesicion() {
        return $this->whereHas('firstDecisionState');
    }
    public function whereBudgetBased() {
        return $this->whereNot('is_internal', true)->whereNot('is_time_based', true);
    }
    public function whereIsTimeBased() {
        return $this->whereNot('is_internal', true)->where('is_time_based', true);
    }
    public function onlyFinished() {
        return $this->whereHas('latestState', fn ($_) => $_->where('progress', ProjectState::Finished));
    }
    public function whereInStats() {
        return $this->whereHas('latestState', fn ($_) => $_->where('is_in_stats', true));
    }
    public function whereRunning() {
        return $this->whereProgress(ProjectState::Running);
    }
    public function whereRunningOrFinishedSuccessfull() {
        return $this->where(function ($query) {
            $query->whereHas('latestState', function ($q) {
                $q->where('progress', ProjectState::Finished)
                    ->where('is_successful', true)
                    ->where('is_in_stats', true);
            })
                ->orWhereHas('latestState', function ($q) {
                    $q->where('progress', ProjectState::Running);
                });
        });
    }
    public function whereFinishedSuccessfull() {
        return $this->whereHas('latestState', fn ($_) => $_->where('progress', ProjectState::Finished)->where('is_successful', true)->where('is_in_stats', true));
    }
    public function whereNotFinished() {
        return $this->whereHas('latestState', fn ($_) => $_->whereNot('progress', ProjectState::Finished));
    }
    public function withItems() {
        return $this->join('invoice_items', 'invoice_items.invoice_id', '=', 'projects.id');
    }
    public function statsKeyVal() {
        return $this->withItems()->select(DB::raw("DATE_FORMAT(projects.created_at, '%Y-%m') AS `key`"), DB::raw('SUM(invoice_items.net) AS `value`'));
    }
    public function whereHasSupportItems() {
        return $this->whereRunning()->where('is_time_based', true)->where('is_internal', false)->whereHas('supportItems');
    }
}
