<?php

use App\Flow\Http\Controllers\ApprovalController;
use App\Flow\Http\Controllers\AuditController;
use App\Flow\Http\Controllers\FlowAdminController;
use App\Flow\Http\Controllers\FlowConfigController;
use App\Flow\Http\Controllers\JobController;
use App\Flow\Http\Controllers\MachineController;
use App\Flow\Http\Controllers\MattermostActionController;
use App\Flow\Http\Controllers\ProjectFlowController;
use App\Flow\Http\Controllers\TransitionController;
use App\Flow\Http\Requests\FlowConfigRequest;
use App\Flow\MachineAbility;
use Illuminate\Support\Facades\Route;

Route::prefix('flow')->middleware('auth:machine,api', 'release.session', 'cache.headers:no_cache;must_revalidate')->group(function () {
    Route::middleware('flow.ability:'.MachineAbility::GATES_READ)->group(function () {
        Route::get('transitions', [TransitionController::class, 'index']);
        Route::get('phases', [FlowConfigController::class, 'phases']);
        Route::get('projects/{project}/phase', [ProjectFlowController::class, 'phase'])->whereNumber('project');
    });
});

Route::prefix('flow')->middleware('auth', 'release.session', 'cache.headers:no_cache;must_revalidate')->group(function () {
    Route::prefix('approvals')->controller(ApprovalController::class)->group(function () {
        Route::get('', 'index');
        Route::post('{approval}/approve', 'approve')->whereNumber('approval');
        Route::post('{approval}/reject', 'reject')->whereNumber('approval');
        Route::post('{approval}/request-changes', 'requestChanges')->whereNumber('approval');
    });

    Route::middleware('role:admin')->group(function () {
        Route::get('config', [FlowAdminController::class, 'index']);
        Route::prefix('config/{resource}')->whereIn('resource', array_keys(FlowConfigRequest::MODELS))->controller(FlowAdminController::class)->group(function () {
            Route::post('', 'store');
            Route::put('{id}', 'update')->whereNumber('id');
            Route::delete('{id}', 'destroy')->whereNumber('id');
        });
        Route::get('audit', [AuditController::class, 'index']);
        Route::get('audit/subject-types', [AuditController::class, 'subjectTypes']);
    });

    Route::get('job-types', [FlowConfigController::class, 'jobTypes']);
    Route::get('risk-classes', [FlowConfigController::class, 'riskClasses']);

    Route::prefix('projects/{project}')->whereNumber('project')->controller(ProjectFlowController::class)->group(function () {
        Route::get('jobs', 'jobs');
        Route::middleware('role:project_manager')->group(function () {
            Route::post('jobs', 'storeJob');
            Route::post('gates/{gateKey}/request', 'requestGate');
            Route::put('risk-class', 'setRiskClass');
        });
    });
});

Route::prefix('flow')->middleware('flow.machine', 'cache.headers:no_cache;must_revalidate')->group(function () {
    Route::get('machine/me', [MachineController::class, 'me']);

    Route::prefix('jobs')->controller(JobController::class)->group(function () {
        Route::get('', 'index')->middleware('flow.ability:'.MachineAbility::JOBS_READ);
        Route::prefix('{job}')->whereNumber('job')->group(function () {
            Route::get('', 'show')->middleware('flow.ability:'.MachineAbility::JOBS_READ);
            Route::get('gates', 'gates')->middleware('flow.ability:'.MachineAbility::GATES_READ);
            Route::middleware('flow.ability:'.MachineAbility::JOBS_WRITE)->group(function () {
                Route::post('claim', 'claim');
                Route::post('gate-request', 'gateRequest');
                Route::post('result', 'result');
                Route::post('fail', 'fail');
            });
        });
    });
});

Route::prefix('flow/chat/mattermost')->middleware('throttle:60,1')->controller(MattermostActionController::class)->group(function () {
    Route::post('actions', 'action');
    Route::post('dialog', 'dialog');
});
