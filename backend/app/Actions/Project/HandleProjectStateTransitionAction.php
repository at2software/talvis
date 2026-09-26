<?php

namespace App\Actions\Project;

use App\Enums\CommentType;
use App\Http\Controllers\PluginMattermostController;
use App\Jobs\ChatAddUsersJob;
use App\Jobs\ChatGetOrCreateChannelJob;
use App\Jobs\ChatRemoveUsersJob;
use App\Jobs\ChatSendMessageJob;
use App\Models\Comment;
use App\Models\Project;
use App\Models\ProjectState;
use App\Queries\ProjectSuccessQuoteQuery;
use Illuminate\Support\Facades\Bus;

class HandleProjectStateTransitionAction {
    public function execute(Project $project, ProjectState $previousState, int $userId): void {
        $name = $project->company->name.' - '.$project->name;
        $icon = config('app.api_url').'companies/'.$project->company->id.'/icon?'.time();

        $stateChangeMessage = $project->getStateChangeMessage($previousState);

        if ($project->hasStateChangedTo(ProjectState::Prepared, $previousState)) {
            $project->repeatingItems->each(fn ($item) => $item->update(['next_recurrence_at' => null]));
        }

        if ($project->hasStateChangedTo(ProjectState::Running, $previousState)) {
            $project->repeatingItems->each(function ($item) {
                if (! $item->next_recurrence_at) {
                    $item->update(['next_recurrence_at' => now()]);
                }
            });

            Comment::create([...$project->toPoly(), 'text' => $stateChangeMessage, 'user_id' => $userId, 'is_mini' => true, 'type' => CommentType::Info]);

            if (! config('app.debug')) {
                $props        = PluginMattermostController::buildWebhookProps($name, $icon);
                $userIds      = $project->assigned_users->pluck('id')->toArray();
                $featuresText = PHP_EOL.'#### Bestellte Features:'.PHP_EOL;
                $featuresText .= $project->orderedFeatures->map(fn ($item) => "* [ ] $item->text ($item->qty $item->unit_name)")->implode(PHP_EOL);

                Bus::chain([
                    new ChatGetOrCreateChannelJob($project),
                    new ChatAddUsersJob($project, $userIds),
                    new ChatSendMessageJob($stateChangeMessage, $props, channelEnvKey: 'TOWN_SQUARE', appendProjectIcon: true),
                    new ChatSendMessageJob($featuresText, $props, $project, imagePath: 'images/projekt_gestartet.png'),
                ])->dispatch();
            }
        }

        if ($project->hasStateChangedTo(ProjectState::Finished, $previousState)) {
            Comment::create([...$project->toPoly(), 'text' => $stateChangeMessage, 'user_id' => $userId, 'is_mini' => true, 'type' => CommentType::Info]);
            $project->clearAssignedTimeBudgets();

            if (! config('app.debug')) {
                $props = PluginMattermostController::buildWebhookProps($name, $icon);
                ChatSendMessageJob::dispatch('', $props, $project, imagePath: 'images/projekt_abgeschlossen.png');
                ChatRemoveUsersJob::dispatch($project, $project->assigned_users->pluck('id')->toArray());
                ChatSendMessageJob::dispatch($stateChangeMessage, $props, channelEnvKey: 'TOWN_SQUARE');
            }
        }

        if ($project->state->is_in_stats) {
            $successRateParam        = $project->company->param('PROJECT_SUCCESS_RATE');
            $successRateParam->value = (new ProjectSuccessQuoteQuery($project->company))->getCurrentPercentage();
            $successRateParam->save();
        }
    }
}
