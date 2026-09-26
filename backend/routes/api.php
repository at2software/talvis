<?php

use App\Http\Controllers\AssignmentController;
use App\Http\Controllers\CalDAVController;
use App\Http\Controllers\CalendarController;
use App\Http\Controllers\CardDAVController;
use App\Http\Controllers\CashController;
use App\Http\Controllers\CommandController;
use App\Http\Controllers\CommentController;
use App\Http\Controllers\CompanyContactController;
use App\Http\Controllers\CompanyController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\CorsController;
use App\Http\Controllers\DebriefController;
use App\Http\Controllers\DeletionLogController;
use App\Http\Controllers\EncryptionController;
use App\Http\Controllers\ExpenseCategoryController;
use App\Http\Controllers\ExpenseController;
use App\Http\Controllers\FileController;
use App\Http\Controllers\FocusController;
use App\Http\Controllers\GitlabAuditController;
use App\Http\Controllers\InvoiceController;
use App\Http\Controllers\InvoiceItemController;
use App\Http\Controllers\InvoiceItemPredictionController;
use App\Http\Controllers\LeadSourceController;
use App\Http\Controllers\LiveSharingController;
use App\Http\Controllers\MarketingActivityController;
use App\Http\Controllers\MarketingAssetController;
use App\Http\Controllers\MarketingController;
use App\Http\Controllers\MarketingInitiativeController;
use App\Http\Controllers\MarketingMetricController;
use App\Http\Controllers\MarketingProspectController;
use App\Http\Controllers\MarketingWorkflowController;
use App\Http\Controllers\MilestoneController;
use App\Http\Controllers\TalvisController;
use App\Http\Controllers\ParamController;
use App\Http\Controllers\PdfTemplateController;
use App\Http\Controllers\PluginGitController;
use App\Http\Controllers\PluginLinkController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\ProductGroupController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectStateController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\SentinelController;
use App\Http\Controllers\StatsController;
use App\Http\Controllers\TaskController;
use App\Http\Controllers\TimetrackerController;
use App\Http\Controllers\UptimeMonitorController;
use App\Http\Controllers\UserController;
use App\Http\Controllers\VacationController;
use App\Http\Controllers\VaultController;
use App\Http\Controllers\WidgetController;
use App\Http\Middleware\WebDAVAuthMiddleware;
use App\Models\Company;
use App\Models\Connection;
use App\Models\Contact;
use App\Models\ExpenseCategory;
use App\Models\File;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\InvoiceReminder;
use App\Models\Product;
use App\Models\ProductGroup;
use App\Models\Project;
use App\Models\User;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;

Route::get('sysinfo', function () {
    return response()->json([
        'version'    => 0.8,
        'method'     => config('app.auth_method'),
        'reverb_key' => config('app.reverb_key'),
    ])->header('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
});

Route::post('login', [UserController::class, 'login']);
Route::middleware('throttle:icons')->withoutMiddleware(ThrottleRequests::class.':api')->group(function () {
    Route::get('companies/{_}/icon', fn (Company $_) => $_->image());
    Route::get('projects/{_}/icon', fn (Project $_) => $_->company->image());
    Route::get('users/{_}/icon', fn (User $_) => $_->image());
    Route::get('users/{_}/mailicon', fn (string $_) => User::findOrFail('email', $_)->image());    // for timetracker
    Route::get('neuron/icon', [TalvisController::class, 'icon']);
});
Route::get('qr', [WidgetController::class, 'getQrCode']);
Route::middleware('apikey:X-Auth-Token,'.config('app.team_monitor_api_key'))->get('/team-monitor', [StatsController::class, 'apiTeamMonitor']);

Route::match(['GET', 'PROPFIND', 'OPTIONS', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'REPORT'], '/carddav/{path?}', [CardDAVController::class, 'handleCardDAV'])->where('path', '.*')->middleware(WebDAVAuthMiddleware::class)->name('/backend/api/carddav');
Route::match(['GET', 'PROPFIND', 'OPTIONS', 'PROPPATCH', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'REPORT'], '/caldav/{path?}', [CalDAVController::class, 'handleCalDAV'])->where('path', '.*')->middleware(WebDAVAuthMiddleware::class)->name('/backend/api/caldav');

Route::middleware('auth', 'release.session', 'cache.headers:no_cache;must_revalidate')->group(function () {
    Route::post('search', [SearchController::class, 'search']);
    Route::post('populate-clipboard', [TalvisController::class, 'populateClipboard']);

    // NOTE: middleware must be declared before ->group(); chaining it after the
    // closure (as this previously did) silently applies to nothing.
    Route::prefix('cash')->middleware('role:financial')->group(function () {
        Route::get('', [CashController::class, 'indexRegisters']);
        Route::get('{_}', [CashController::class, 'indexEntries']);
        Route::post('{_}', [CashController::class, 'storeEntry']);
        Route::delete('entries/{_}', [CashController::class, 'destroyEntry']);
    });

    Route::prefix('comments')->group(function () {});

    Route::prefix('commands')->controller(CommandController::class)->middleware('role:admin')->group(function () {
        Route::get('', 'index');
        Route::post('execute', 'execute');
        Route::get('{command}', 'show');
    });


    Route::prefix('cors')->group(function () {
        Route::post('', [CorsController::class, 'curl']);
        Route::prefix('{id}')->group(function () {
            Route::post('', [CorsController::class, 'curlId']);
        });
    });

    Route::prefix('companies')->group(function () {
        Route::get('support', [CompanyController::class, 'indexUnbilledFoci']);
        Route::get('with-coordinates', [CompanyController::class, 'indexWithCoordinates']);
        Route::get('{_}/projects', [ProjectController::class, 'indexForCompany']);
        Route::get('{_}/co-participated-projects', [ProjectController::class, 'indexCoParticipatedProjects']);
        Route::get('by-phone', [CompanyController::class, 'showByPhone']);
        Route::post('draft', [CompanyController::class, 'storeDraft'])->middleware('role:project_manager|marketing');

        Route::get('stats', [InvoiceController::class, 'getCustomerStats'])->middleware('role:financial');
        Route::get('overdue-for-contact', [CompanyController::class, 'indexOverdueForContact'])->middleware('role:financial|project_manager|marketing');
        Route::get('churn-risk', [CompanyController::class, 'indexByChurnRisk'])->middleware('role:financial|project_manager|marketing');

        Route::prefix('maintenance')->controller(CompanyController::class)->group(function () {
            Route::get('commercial-register', 'maintenanceCommercialRegister');
        });
        Route::prefix('{_}')->controller(CompanyController::class)->group(function () {
            Route::get('assignees', 'indexAssignees');
            Route::get('comments', 'indexComments');
            Route::get('connections', 'indexConnections');
            Route::get('employees', 'indexEmployees');
            Route::get('foci', 'indexFoci');
            Route::get('import_imprint', 'importImprint');
            Route::get('invoice', 'makeInvoice');
            Route::get('prediction-accuracy', 'showPredictionAccuracy');
            Route::middleware('role:project_manager|marketing')->group(function () {
                Route::post('assignees', 'storeAssignee');
                Route::post('employees', 'storeEmployee');
                Route::put('activate-repeating-items', 'updateActivateRepeatingItems');
                Route::put('keep', 'keep');
                Route::delete('draft', 'discardDraft');
            });
            Route::middleware('role:invoicing')->group(function () {
                Route::get('invoice-items', 'indexInvoiceItems');
            });
        })->whereNumber('_');
        Route::prefix('{_}')->group(function () {
            Route::post('avatar', [FileController::class, 'storeCompanyAvatar']);
            Route::post('media', [FileController::class, 'uploadCompanyMedia']);
            Route::post('projects', [CompanyController::class, 'storeProject'])->middleware('role:project_manager|marketing');

        })->whereNumber('_');
        ParamController::getRoute(Company::class);
    });
    Route::prefix('company_contacts')->controller(CompanyContactController::class)->group(function () {
        Route::prefix('{_}')->group(function () {});
    });

    Route::prefix('connections')->group(function () {
        Route::get('/', [CompanyController::class, 'indexAllConnections']);
        Route::post('/', [CompanyController::class, 'storeConnection'])->middleware('role:project_manager|marketing');
        Route::delete('/{_}', fn (Connection $_) => $_->delete());
    });

    Route::prefix('contacts')->group(function () {
        Route::prefix('{_}')->group(function () {
            Route::put('add-linkedin', [ContactController::class, 'updateAddLinkedIn']);
            Route::put('unlink/{company}', [ContactController::class, 'unlink']);
        });

        Route::prefix('maintenance')->controller(ContactController::class)->group(function () {
            Route::get('birthdays', 'maintenanceMissingBirthday');
        });
    });

    Route::prefix('expenses')->middleware('role:financial')->group(function () {
        Route::get('/categories', fn () => ExpenseCategory::all());
        Route::get('/bank-transactions', [ExpenseController::class, 'bankTransactions']);
    });

    Route::prefix('foci')->middleware('role:hr|project_manager')->group(function () {
        Route::get('/uninvoiced/{path}/{id}', fn (string $path, string $id) => Focus::fromPath($path.'/'.$id)->foci_unbilled()->get());
        Route::post('/create-items/{path}/{id}', fn (string $path, string $id) => Focus::fromPath($path.'/'.$id)->createInvoiceItemsFromFoci(request()));
    });

    Route::prefix('live-sharing')->controller(LiveSharingController::class)->group(function () {
        Route::post('toggle', 'toggleSharing');
        Route::get('active', 'getActiveSharings');
    });

    Route::prefix('invoices')->middleware('role:financial')->group(function () {
        Route::get('/cashflow', [InvoiceController::class, 'showCashFlow']);
        Route::get('/liquidity', [InvoiceController::class, 'showLiquidity']);
        Route::post('/cashflow/upload', [InvoiceController::class, 'uploadBankCsv']);
    });

    Route::prefix('invoices')->middleware('role:invoicing')->group(function () {
        Route::get('/current_no', fn () => Invoice::getCurrentInvoiceNumber());
        Route::get('/current_no_int', fn () => Invoice::getCurrentInvoiceNumberInt());
        Route::get('/last-payments', fn () => Invoice::whereNotNull('paid_at')->latest('paid_at')->with('company')->take(20)->get());
        Route::get('/monthly-revenue-ranges', [InvoiceController::class, 'indexMonthlyRevenueRanges']);
        Route::get('/monthly-spiral-revenue', [InvoiceController::class, 'indexMonthlySpiralRevenue']);

        Route::prefix('{_}')->controller(InvoiceController::class)->group(function () {
            Route::get('invoice-items', 'indexInvoiceItems');
            Route::get('pdf', 'showPdf');
            Route::post('cancel', 'updateCancel');
            Route::post('send-mail', 'sendMail');
            Route::post('send-reminder', 'sendReminder');
            Route::put('update-values', 'updateValues');
            Route::post('datev', 'sendToDatev');
            Route::put('undo', 'updateUndo');
        })->whereNumber('_');
    });

    Route::prefix('invoice_items')->middleware('role:invoicing|project_manager')->group(function () {
        Route::put('/reorder', [InvoiceItemController::class, 'reorder']);
        Route::post('/combine', [InvoiceItemController::class, 'combine']);
        Route::get('/standing-orders', [InvoiceItemController::class, 'indexStandingOrders']);
        Route::prefix('{_}')->group(function () {
            Route::post('predict', [InvoiceItemPredictionController::class, 'predict']);
            Route::delete('predict', [InvoiceItemPredictionController::class, 'deletePrediction']);
        })->whereNumber('_');
    });

    Route::prefix('invoice_reminders')->middleware('role:invoicing')->group(function () {
        Route::get('/{_}/pdf', function (InvoiceReminder $_) {
            if (! $_->invoice) {
                return response()->json(['error' => 'Invoice not found (may be deleted)', 'reminder_id' => $_->id, 'invoice_id' => $_->invoice_id], 404);
            }
            if (! $_->file_dir) {
                return response()->json(['error' => 'Reminder has no file path stored', 'reminder_id' => $_->id], 500);
            }
            if (! Storage::exists($_->file_dir)) {
                return response()->json(['error' => 'PDF file not found in storage', 'reminder_id' => $_->id, 'file_dir' => $_->file_dir], 404);
            }
            return File::stream($_->file_dir, $_->invoice->name.' - '.$_->stage.' reminder.pdf');
        });
    });

    Route::prefix('marketing')->middleware('role:marketing')->group(function () {
        Route::get('user', [MarketingController::class, 'showUserForAddon']); // Firefox addon auth check
        Route::get('funnel', [MarketingController::class, 'getFunnelChart']);
        Route::get('remarketing', [MarketingController::class, 'getRemarketing']);
        Route::get('remarketing/due', [MarketingController::class, 'getRemarketingDue']);
        Route::get('dashboard', [MarketingController::class, 'getDashboardStats']);

        Route::prefix('initiatives')->controller(MarketingInitiativeController::class)->group(function () {
            Route::get('', 'indexInitiatives');
            Route::post('', 'storeInitiative');
            Route::get('for-addon', 'indexInitiativesForAddon'); // Firefox addon support
            Route::prefix('{marketingInitiative}')->group(function () {
                Route::get('', 'showInitiative');
                Route::put('', 'updateInitiative');
                Route::delete('', 'destroyInitiative');
                Route::get('channels', 'indexInitiativeChannels');
                Route::post('channels', 'addInitiativeChannel');
                Route::put('channels', 'updateInitiativeChannels');
                Route::delete('channels/{leadSource}', 'removeInitiativeChannel');
                Route::get('workflows', 'indexInitiativeWorkflows');
                Route::post('workflows', 'attachWorkflowToInitiative');
                Route::delete('workflows/{marketingWorkflow}', 'detachWorkflowFromInitiative');
                Route::get('metrics', 'indexInitiativeMetrics');
                Route::get('metrics/all', 'indexAllInitiativeMetrics');
                Route::post('metrics', 'attachInitiativeMetric');
                Route::put('metrics/{marketingPerformanceMetric}', 'updateInitiativeMetric');
                Route::delete('metrics/{marketingPerformanceMetric}', 'detachInitiativeMetric');
                Route::get('stats', 'showInitiativeStats');
                Route::get('activity', 'indexInitiativeRecentActivity');
                Route::post('users', 'subscribeUserToInitiative');
                Route::delete('users/{userId}', 'unsubscribeUserFromInitiative');
                Route::get('activities', 'indexInitiativeActivities');
                Route::post('activities', 'storeInitiativeActivity');
                Route::prefix('activities/{marketingInitiativeActivity}')->group(function () {
                    Route::put('', 'updateInitiativeActivity');
                    Route::delete('', 'destroyInitiativeActivity');
                    Route::post('metrics', 'attachInitiativeActivityMetric');
                    Route::delete('metrics/{marketingPerformanceMetric}', 'detachInitiativeActivityMetric');
                });
            });
        });

        Route::prefix('workflows')->controller(MarketingWorkflowController::class)->group(function () {
            Route::get('', 'indexWorkflows');
            Route::post('', 'storeWorkflow');
            Route::prefix('{marketingWorkflow}')->group(function () {
                Route::get('', 'showWorkflow');
                Route::put('', 'updateWorkflow');
                Route::delete('', 'destroyWorkflow');
                Route::get('stats', 'showWorkflowStats');
                Route::get('activities', 'indexWorkflowActivities');
                Route::post('activities', 'storeWorkflowActivity');
                Route::put('activities/{marketingActivity}', 'updateWorkflowActivity');
                Route::delete('activities/{marketingActivity}', 'destroyWorkflowActivity');
            });
        });

        Route::prefix('activities')->controller(MarketingActivityController::class)->group(function () {
            Route::prefix('{marketingActivity}')->group(function () {
                Route::get('metrics', 'indexActivityMetrics');
                Route::post('metrics', 'attachActivityMetric');
                Route::put('metrics/{marketingPerformanceMetric}', 'updateActivityMetric');
                Route::delete('metrics/{marketingPerformanceMetric}', 'detachActivityMetric');
            });
        });

        Route::prefix('prospects')->controller(MarketingProspectController::class)->group(function () {
            Route::get('', 'indexProspects');
            Route::post('', 'storeProspect');
            Route::get('stats', 'showProspectStats');
            Route::get('by-phone', 'showProspectByPhone');
            Route::post('from-addon', 'storeProspectFromAddon');
            Route::get('activities-for-addon', 'indexProspectActivitiesForAddon');
            Route::put('activity/{activityId}', 'updateProspectActivityById');
            Route::post('activity/{activityId}/bump', 'bumpProspectActivity');
            Route::prefix('{marketingProspect}')->group(function () {
                Route::get('', 'showProspect');
                Route::put('', 'updateProspect');
                Route::delete('', 'destroyProspect');
                Route::post('link-to-company', 'linkProspectToCompany');
                Route::post('convert', 'convertProspect');
                Route::post('postpone-activities', 'postponeProspectActivities');
                Route::put('activities/{activityId}/status', 'updateProspectActivityStatus');
            });
        });

        Route::prefix('metrics')->controller(MarketingMetricController::class)->group(function () {
            Route::get('', 'indexPerformanceMetrics');
            Route::post('', 'storePerformanceMetric');
            Route::prefix('{marketingPerformanceMetric}')->group(function () {
                Route::get('', 'showPerformanceMetric');
                Route::put('', 'updatePerformanceMetric');
                Route::delete('', 'destroyPerformanceMetric');
            });
        });
    });

    Route::prefix('marketing-assets')->controller(MarketingAssetController::class)->middleware('role:marketing')->group(function () {
        Route::get('', 'index');
        Route::post('', 'store');
        Route::put('{id}/tags', 'updateTags');
        Route::put('{id}/category', 'updateCategory');
        Route::delete('{id}', 'destroy');
    });

    Route::prefix('milestones')->controller(MilestoneController::class)->group(function () {
        Route::get('overview', 'indexOverview');
        Route::delete('{milestone}/dependencies', 'removeDependency');
        Route::delete('{milestone}/dependencies/bulk', 'removeDependencies');
        Route::post('{milestone}/dependencies/bulk/delete', 'removeDependencies');
        Route::post('{milestone}/invoice-items/{invoice_item}', 'linkInvoiceItem');
        Route::delete('{milestone}/invoice-items/{invoice_item}', 'unlinkInvoiceItem');
        Route::post('{milestone}/dependencies', 'addDependency');
        Route::put('reorder', 'reorder');
        Route::post('{milestone}/resolve', 'resolve');
    });

    Route::prefix('neuron')->group(function () {
        Route::get('/attention', [TalvisController::class, 'attention']);
    });

    Route::prefix('params')->group(function () {
        Route::get('{key}/history', [ParamController::class, 'history']);
        Route::prefix('{key}/{type?}/{id?}')->controller(ParamController::class)->group(function () {
            Route::get('history', 'history');
            Route::get('', 'show');
            Route::post('', 'store');
            Route::put('', 'update');
            Route::delete('', 'destroy');
        })->whereNumber('_');
    });

    Route::prefix('pdf-template')->middleware('role:admin')->controller(PdfTemplateController::class)->group(function () {
        Route::get('', 'show');
        Route::put('', 'update');
        Route::post('preview', 'preview');
        Route::post('revert', 'revert');
        Route::post('logo', 'uploadLogo');
    });

    Route::prefix('products')->middleware('role:product_manager')->group(function () {
        Route::get('statistics', [ProductController::class, 'showStatistics']);
        Route::get('root-groups', [ProductController::class, 'indexRootGroups']);
        Route::prefix('{_}')->group(function () {
            Route::get('invoice-items', fn (Product $_) => $_->indexedItems()->get());
            Route::get('split', [ProductController::class, 'showSplit']);
            Route::put('deprecate', fn (Product $_) => $_->activate(false));
            Route::put('activate', fn (Product $_) => $_->activate(true));
            Route::get('customers', [ProductController::class, 'indexCustomers']);
        })->whereNumber('_');
    });

    Route::prefix('product_groups')->middleware('role:product_manager')->group(function () {
        Route::prefix('{_}')->group(function () {
            Route::put('deprecate', fn (ProductGroup $_) => $_->activate(false));
            Route::put('activate', fn (ProductGroup $_) => $_->activate(true));
            Route::get('customers', [ProductGroupController::class, 'indexCustomers']);
        })->whereNumber('_');
    });

    Route::prefix('projects')->group(function () {
        Route::get('reporting', [ProjectController::class, 'showReporting']);
        Route::get('missing-git', [ProjectController::class, 'indexMissingGit']);
        Route::get('overrun-risk', [ProjectController::class, 'indexOverrunRisk'])->middleware('role:project_manager');
        Route::post('resolve-plugin-link-urls', [ProjectController::class, 'resolvePluginLinkUrls']);
        Route::get('frameworks', [ProjectController::class, 'indexFrameworks']);
        Route::put('frameworks', [ProjectController::class, 'updateFrameworks']);
        Route::get('frameworks/latest', [ProjectController::class, 'indexFrameworksLatest']);
        Route::prefix('{_}')->controller(ProjectController::class)->group(function () {
            Route::get('assignees', 'indexAssignees');
            Route::post('assignees', 'storeAssignee');
            Route::put('set-main-contact', 'updateSetMainContact');
            Route::get('comments', 'indexComments');
            Route::get('foci', 'indexFoci');
            Route::get('invoice', 'makeInvoice');
            Route::get('quote-descriptions', 'indexQuoteDescriptions');
            Route::get('invoice-items/estimation', 'indexInvoiceItemsForEstimation');
            Route::get('features', 'indexFeatures');
            Route::middleware('role:invoicing|project_manager')->group(function () {
                Route::get('invoice-items', 'indexInvoiceItems');
                Route::get('payment-plan', 'showPaymentPlan');
            });
            Route::get('milestones', 'indexMilestones');
            Route::post('milestones', 'storeMilestone');
            Route::post('convert-invoice-items-to-milestones', 'convertInvoiceItemsToMilestones');
            Route::put('move-regular-to-customer', 'moveRegularItemsToCustomer');
            Route::put('move-support-to-customer', 'moveSupportToCustomer');
            Route::put('convert-support-to-regular', 'convertSupportItemsToRegular');
            Route::put('postpone', 'postpone');
            Route::post('duplicate', 'duplicate')->middleware('role:project_manager');
            Route::get('pdf', 'makeQuote');
            Route::get('quote-acceptance-prediction', 'showQuoteAcceptancePrediction')->middleware('role:project_manager');
            Route::get('connection-projects', 'indexConnectionProjects');
            Route::post('connection-projects', 'storeConnectionProject');
            Route::delete('connection-projects/{connectionProject}', 'destroyConnectionProject');
        })->whereNumber('_');
        Route::prefix('{_}')->group(function () {
            Route::get('invoice-items/stats', [InvoiceItemPredictionController::class, 'stats']);
            Route::post('media', [FileController::class, 'uploadProjectMedia']);
            Route::post('plugin_links', [PluginLinkController::class, 'storeForProject']);
            Route::post('plugin_link_channel', [PluginLinkController::class, 'createPluginLinkWithChannel']);
            Route::get('tasks', [TaskController::class, 'indexForProject']);
            Route::post('tasks', [TaskController::class, 'storeForProject']);
            Route::put('tasks/{task}', [TaskController::class, 'update']);
            Route::put('tasks/{task}/assign', [TaskController::class, 'assign']);
            Route::delete('tasks/{task}', [TaskController::class, 'destroy']);
        })->whereNumber('_');
        ParamController::getRoute(Project::class);
        Route::delete('{project}/milestones/wipe-board', [MilestoneController::class, 'destroyAllForProject']);
    });

    Route::prefix('uptime_monitors')->controller(UptimeMonitorController::class)->group(function () {
        Route::get('', 'index');
        Route::post('', 'store');
        Route::prefix('{_}')->group(function () {
            Route::get('', 'show');
            Route::put('', 'update');
            Route::delete('', 'destroy');
            Route::get('checks', 'indexChecks');
            Route::get('recipients', 'indexRecipients');
            Route::put('recipients/{user}', 'updateRecipient');
            Route::post('test', 'testCheck');
            Route::get('stats', 'stats');
        })->whereNumber('_');
    });

    Route::prefix('debriefs')->controller(DebriefController::class)->group(function () {
        Route::get('categories', 'indexCategories');
        Route::get('problems', 'indexProblems');
        Route::post('problems', 'storeProblem');
        Route::prefix('problems/{problem}')->group(function () {
            Route::get('', 'showProblem');
            Route::put('', 'updateProblem');
            Route::delete('', 'destroyProblem');
            Route::post('solutions', 'storeProblemSolution');
            Route::put('solutions/{solution}', 'updateProblemSolution');
            Route::delete('solutions/{solution}', 'destroyProblemSolution');
        });
        Route::get('solutions', 'indexSolutions');
        Route::post('solutions', 'storeSolution');
        Route::prefix('solutions/{solution}')->group(function () {
            Route::put('', 'updateSolution');
            Route::delete('', 'destroySolution');
        });
        Route::get('', 'indexDebriefs');
        Route::prefix('{debrief}')->group(function () {
            Route::put('', 'updateDebrief');
            Route::delete('', 'destroyDebrief');
            Route::post('problems', 'storeDebriefProblem');
            Route::put('problems/{problem}', 'updateDebriefProblem');
            Route::delete('problems/{problem}', 'destroyDebriefProblem');
            Route::post('positives', 'storePositive');
            Route::delete('positives/{positive}', 'destroyDebriefPositive');
        });
        Route::get('positives/search', 'searchPositives');
        Route::put('positives/{positive}', 'updatePositive');
        Route::delete('positives/{positive}', 'destroyPositive');
        Route::get('stats', 'showStats');
        Route::get('stats/aggregated', 'showStatsAggregated');
        Route::get('stats/categories', 'showStatsCategories');
        Route::get('stats/top-problems', 'showStatsTopProblems');
        Route::get('stats/top-solutions', 'showStatsTopSolutions');
        Route::get('stats/top-positives', 'showStatsTopPositives');
        Route::get('stats/categories-positives', 'showStatsCategoriesPositives');
        Route::get('stats/trends', 'showStatsTrends');
        Route::post('problems/combine', 'combineProblems');
        Route::post('positives/combine', 'combinePositives');
        Route::get('stats/top-customers-worst', 'showStatsTopCustomersWorst');
        Route::get('stats/top-customers-best', 'showStatsTopCustomersBest');
    });

    Route::prefix('projects/{project}/debriefs')->controller(DebriefController::class)->group(function () {
        Route::get('', 'indexProjectDebriefs');
        Route::post('', 'storeDebrief');
    });

    Route::prefix('sentinels')->group(function () {
        Route::get('/active', [SentinelController::class, 'indexActive']);
    });

    Route::controller(StatsController::class)->prefix('stats')->group(function () {
        Route::get('my-working-time', 'showMyWorkingTime');
        Route::get('quote-acceptance-signal-curve/{signal}', 'showQuoteAcceptanceSignalCurve');
        Route::get('quote-accuracy', 'showQuoteAccuracy');
        Route::get('project-product-mix', 'showProjectProductMix');
        Route::get('project-success-rate', 'showProjectSuccessRate');
        Route::get('project-warranty-load', 'showProjectWarrantyLoad');
        Route::get('team-status', 'showTeamStatus');
        Route::get('focus-categories', 'indexFocusCategories');

        Route::middleware('role:invoicing|financial')->group(function () {
            Route::get('revenue-current-year', 'showRevenueCurrentYear');
            Route::get('service-vs-budget', 'showSvB');
            Route::get('invoice-overall', 'showInvoiceOverall');
            Route::get('linear-regression-forecast', 'showLinearRegressionForecast');
            Route::get('company-prediction-accuracy', 'showCompanyPredictionAccuracy');
            Route::get('customer-revenue-scatter', 'showCustomerRevenueScatter');
        });

        Route::middleware('role:hr|project_manager')->group(function () {
            Route::get('prediction-accuracy', 'showPredictionAccuracy');
            Route::get('focus-accuracy', 'showFocusAccuracy');
        });
    });

    Route::prefix('timetracker')->controller(TimetrackerController::class)->group(function () {
        Route::get('/', 'index');
        Route::put('/', 'update');
        Route::post('/', 'store');
        Route::get('/recent-comments', 'indexRecentComments');
        Route::post('/search', 'search');
        Route::post('/subscribe', 'subscribe');
        Route::post('/unsubscribe', 'unsubscribe');
        Route::post('/status', 'updateStatus');
        Route::post('/join', 'join');
        Route::put('/current_focus', 'updateCurrentFocus');
        Route::put('/status', 'updateStatus');
    });

    Route::prefix('users')->group(function () {
        Route::get('/me', fn () => Auth::user());
        Route::get('/environment', [UserController::class, 'showEnvironment']);
        Route::post('travel-expenses', [FileController::class, 'uploadTravelExpenses']);

        Route::prefix('{_}')->middleware('hr_permission')->group(function () {
            Route::post('avatar', [FileController::class, 'storeUserAvatar']);
            Route::get('foci', [UserController::class, 'indexFoci']);
            Route::get('milestones', [UserController::class, 'indexMilestones']);
            Route::get('pm-milestones', [UserController::class, 'indexPmMilestones']);
            Route::get('project_load', [UserController::class, 'indexProjectLoad']);
            Route::get('vacation_stats', [VacationController::class, 'indexVacationStats']);
            Route::post('encrypt', [EncryptionController::class, 'encrypt']);
            Route::get('vacation_grants', [VacationController::class, 'indexGrants']);
            Route::get('vacation_requests', [VacationController::class, 'indexRequests']);
            Route::get('vacation_absences', [VacationController::class, 'indexAbsences']);
            Route::get('show-foci-30d', [UserController::class, 'showFoci30D']);
            Route::get('daily-workload', [UserController::class, 'indexDailyWorkload']);

            Route::middleware('role:hr')->get('time-based-employment', [UserController::class, 'showTimeBasedEmploymentInfo']);
            Route::middleware('role:hr')->post('time-based-employment', [UserController::class, 'createTbe']);
            Route::prefix('employment')->middleware('role:hr')->group(function () {
                Route::post('', [UserController::class, 'storeEmployment']);
                Route::put('{id}', [UserController::class, 'updateEmployment']);
                Route::delete('{id}', [UserController::class, 'deleteEmployment']);
            });
            Route::post('reset-password', [UserController::class, 'resetPassword'])->middleware('role:admin');
        })->whereNumber('_');
        ParamController::getRoute(User::class);
    });

    Route::prefix('vacations')->controller(VacationController::class)->group(function () {
        Route::get('holidays', 'indexHolidays');
        Route::post('sick-notes', 'storeSickNote');
        Route::put('/{vacation}/revoke', 'revoke');

        Route::middleware('role:hr')->group(function () {
            Route::get('requests', 'indexPendingRequests');
            Route::get('sick-notes', 'indexSickNotes');
            Route::post('manual', 'storeManual');
            Route::put('/{vacation}/approve', 'approve');
            Route::prefix('{_}')->group(function () {
                Route::put('acknowledge', 'acknowledge');
            });
        });
    });
    Route::get('vacation_grants/{grant}', [VacationController::class, 'showGrant'])->middleware('owner:user_id,hr');
    Route::middleware('role:hr')->group(function () {
        Route::post('vacation_grants', [VacationController::class, 'storeGrant']);
        Route::delete('vacation_grants/{grant}', [VacationController::class, 'destroyGrant']);
    });

    Route::prefix('widgets')->group(function () {
        Route::get('new-items', [WidgetController::class, 'indexNewItems']);
        Route::get('prepared-invoices', [WidgetController::class, 'preparedInvoices'])->middleware('role:financial');
        Route::get('unpaid-invoices', [WidgetController::class, 'unpaidInvoices'])->middleware('role:financial');
        Route::get('cashflow/{key}', [WidgetController::class, 'cashflowWidget'])->middleware('role:financial|project_manager');
        Route::get('index-jubilees', [WidgetController::class, 'indexJubilees'])->middleware('role:hr|project_manager');
        Route::get('index-time-based-employees', [WidgetController::class, 'indexTimeBasedEmployees'])->middleware('role:hr');
    });

    Route::prefix('roles')->middleware('role:admin')->group(function () {
        Route::get('', [RoleController::class, 'index']);
        Route::post('{role}/users/{user}', [RoleController::class, 'assign']);
        Route::delete('{role}/users/{user}', [RoleController::class, 'remove']);
    });

    Route::resource('calendar_entries', CalendarController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::resource('assignments', AssignmentController::class)->only(['update']);
    Route::resource('assignments', AssignmentController::class)->only(['destroy'])->middleware('owner:assignee_id,project_manager');

    Route::resource('comments', CommentController::class)->only(['store']);
    Route::resource('comments', CommentController::class)->only(['update', 'destroy'])->middleware('owner:user_id,admin');

    Route::resource('companies', CompanyController::class)->only(['index', 'show']);
    Route::resource('companies', CompanyController::class)->only(['store', 'update'])->middleware('role:project_manager|marketing');
    Route::resource('companies', CompanyController::class)->only(['destroy'])->middleware('role:admin');

    Route::resource('company_contacts', CompanyContactController::class)->only(['show']);
    Route::resource('company_contacts', CompanyContactController::class)->only(['store', 'update'])->middleware('role:project_manager|marketing');
    Route::resource('company_contacts', CompanyContactController::class)->only(['destroy'])->middleware('role:admin');

    Route::resource('contacts', ContactController::class)->only(['store', 'update'])->middleware('role:project_manager|marketing');
    Route::resource('contacts', ContactController::class)->only(['destroy'])->middleware('role:admin');

    Route::resource('encryptions', EncryptionController::class)->only(['update', 'destroy'])->middleware('owner:user_id');

    Route::resource('expenses', ExpenseController::class)->only(['index', 'show', 'store', 'update', 'destroy'])->middleware('role:financial');
    Route::resource('expense-categories', ExpenseCategoryController::class)->only(['index', 'show', 'store', 'update', 'destroy'])->middleware('role:financial');

    Route::resource('files', FileController::class)->only(['show', 'store', 'update']);
    Route::resource('files', FileController::class)->only(['destroy'])->middleware('role:admin');

    Route::resource('foci', FocusController::class)->only(['store', 'update'])->middleware('owner:user_id,hr|project_manager|financial');
    Route::resource('foci', FocusController::class)->only(['destroy'])->middleware('role:admin');

    Route::resource('invoices', InvoiceController::class)->only(['index', 'show', 'store', 'update', 'destroy'])->middleware('role:invoicing');

    Route::resource('invoice_items', InvoiceItemController::class)->only(['show'])->middleware('role:invoicing|project_manager');
    Route::resource('invoice_items', InvoiceItemController::class)->only(['update'])->middleware('permission_invoiceItem');
    Route::resource('invoice_items', InvoiceItemController::class)->only(['store', 'destroy'])->middleware(['role:invoicing|project_manager', 'permission_invoiceItem']);

    Route::resource('lead_sources', LeadSourceController::class);
    Route::resource('project_states', ProjectStateController::class)->only(['index', 'update']);
    Route::resource('milestones', MilestoneController::class)->only(['index', 'show', 'store', 'update', 'destroy']);
    Route::resource('plugin_links', PluginLinkController::class)->only(['store', 'update', 'destroy']);

    Route::resource('products', ProductController::class)->only(['index', 'show']);
    Route::resource('products', ProductController::class)->only(['store', 'update', 'destroy'])->middleware('role:product_manager');

    Route::resource('product_groups', ProductGroupController::class)->only(['index', 'show']);
    Route::resource('product_groups', ProductGroupController::class)->only(['store', 'update', 'destroy'])->middleware('role:product_manager');

    Route::resource('projects', ProjectController::class)->only(['index', 'show']);
    Route::resource('projects', ProjectController::class)->only(['store', 'update'])->middleware('role:project_manager');
    Route::resource('projects', ProjectController::class)->only(['destroy'])->middleware('role:admin');

    Route::resource('sentinels', SentinelController::class)->only(['index', 'show', 'store', 'update', 'destroy'])->middleware('role:admin');
    Route::resource('tasks', TaskController::class);
    Route::post('tasks/{task}/co-assignees', [TaskController::class, 'addCoAssignee']);
    Route::delete('tasks/{task}/co-assignees/{assignment}', [TaskController::class, 'removeCoAssignee']);
    Route::resource('users', UserController::class)->only(['show'])->middleware('owner:id,project_manager|hr');
    Route::resource('users', UserController::class)->only(['update'])->middleware('owner:id,hr');
    Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('role:admin');
    Route::post('users', [UserController::class, 'store'])->middleware('role:hr');
    Route::get('users', [UserController::class, 'index'])->middleware('hr_permission');
    Route::resource('vacations', VacationController::class)->only(['show', 'store'])->middleware('owner:vacation_grant.user_id,hr');
    Route::resource('vacations', VacationController::class)->only(['destroy'])->middleware('role:admin');
    Route::post('vaults/tan', [VaultController::class, 'submitTan'])->middleware('role:admin');
    Route::get('vaults/bank-lookup', [VaultController::class, 'bankLookup'])->middleware('role:admin');
    Route::resource('vaults', VaultController::class)->middleware('role:admin');

    Route::prefix('gitlab-audit')->controller(GitlabAuditController::class)->group(function () {
        Route::get('', 'index');
        Route::post('', 'store');
        Route::put('{gitlabAuditProject}', 'update');
        Route::delete('{gitlabAuditProject}', 'destroy');
    });

    Route::prefix('deletion_logs')->controller(DeletionLogController::class)->middleware('role:admin')->group(function () {
        Route::get('', 'index');
        Route::get('model-types', 'indexModelTypes');
        Route::put('{deletionLog}/restore', 'restore');
    });
});

Route::prefix('gitlab')->controller(PluginGitController::class)->group(function () {
    Route::post('', 'onWebhook');
    Route::put('', 'onWebhook');
});
