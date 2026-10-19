<?php

namespace App\Flow;

use App\Events\ProjectStateTransitioned;
use App\Events\ProjectStateTransitioning;
use App\Flow\Console\IssueMachineToken;
use App\Flow\Console\ReleaseStaleClaims;
use App\Flow\Console\RevokeMachineToken;
use App\Flow\Events\ApprovalDecided;
use App\Flow\Events\ApprovalRequested;
use App\Flow\Http\Middleware\EnsureMachineToken;
use App\Flow\Http\Middleware\RequireMachineAbility;
use App\Flow\Listeners\AdvanceJobAfterDecision;
use App\Flow\Listeners\EnforcePhaseGates;
use App\Flow\Listeners\NotifyChatOfApprovalRequest;
use App\Flow\Listeners\RecordProjectStateTransition;
use App\Flow\Models\RiskClass;
use App\Models\Project;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class FlowServiceProvider extends ServiceProvider {
    public function boot(): void {
        Event::listen(ProjectStateTransitioned::class, RecordProjectStateTransition::class);
        Event::listen(ProjectStateTransitioning::class, EnforcePhaseGates::class);
        Event::listen(ApprovalDecided::class, AdvanceJobAfterDecision::class);
        Event::listen(ApprovalRequested::class, NotifyChatOfApprovalRequest::class);
        Project::resolveRelationUsing('flowRiskClass', fn (Project $project) => $project->belongsTo(RiskClass::class, 'flow_risk_class_id'));

        Route::aliasMiddleware('flow.ability', RequireMachineAbility::class);
        Route::middlewareGroup('flow.machine', ['auth:machine', EnsureMachineToken::class, 'throttle:flow-machine']);
        RateLimiter::for('flow-machine', fn (Request $request) => Limit::perMinute(config('flow.machine_rate_limit'))->by('flow-machine:'.$request->user()?->getAuthIdentifier()));

        if ($this->app->runningInConsole()) {
            $this->commands([IssueMachineToken::class, RevokeMachineToken::class, ReleaseStaleClaims::class]);
        }
    }
}
