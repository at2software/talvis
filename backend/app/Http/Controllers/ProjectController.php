<?php

namespace App\Http\Controllers;

use App\Enums\InvoiceItemType;
use App\Http\Controllers\Traits\HasFociController;
use App\Http\Requests\MilestoneRequest;
use App\Http\Requests\Project\DuplicateProjectRequest;
use App\Http\Requests\Project\PostponeRequest;
use App\Http\Requests\Project\StoreConnectionProjectRequest;
use App\Http\Requests\Project\UpdateFrameworksRequest;
use App\Http\Requests\Project\UpdateMainContactRequest;
use App\Http\Requests\Project\UpdateProjectRequest;
use App\Models\Assignment;
use App\Models\Company;
use App\Models\ConnectionProject;
use App\Models\Framework;
use App\Models\InvoiceItem;
use App\Models\PluginLink;
use App\Models\Project;
use App\Models\ProjectState;
use App\Services\Project\ProjectDetailsService;
use App\Services\Project\ProjectFrameworksService;
use App\Services\Project\ProjectMilestonesService;
use App\Services\Project\ProjectPluginLinkResolverService;
use App\Services\Project\ProjectQuoteAcceptanceService;
use App\Services\Project\ProjectReportingService;
use Illuminate\Http\Request;

class ProjectController extends Controller {
    use HasFociController;

    public function __construct(
        private ProjectDetailsService $projectDetailsService,
        private ProjectFrameworksService $projectFrameworksService,
        private ProjectMilestonesService $projectMilestonesService,
        private ProjectPluginLinkResolverService $projectPluginLinkResolverService,
        private ProjectQuoteAcceptanceService $projectQuoteAcceptanceService,
        private ProjectReportingService $projectReportingService,
    ) {}

    public function _index($request, $builder) {
        $requestedStates = $request->has('states') ? explode(',', $request->states) : null;
        unset($request['states']);

        $query = $builder->whereRequest()->withRequest();
        if (request('only-mine') === 'true') {
            $query->whereHas('myAssignment');
        }
        if (request('only-mine-as-pm') === 'true') {
            $query->where('project_manager_id', request()->user()->id);
        }
        if (request('missing_project_manager') === 'true') {
            $query->whereNull('project_manager_id');
        }
        if ($requestedStates) {
            $query->whereStateIn($requestedStates);
        }
        if ($request->has('created_at')) {
            $query->whereBetweenString($request->created_at);
        }
        if ($request->has('started_at')) {
            $query->whereHas('firstStartedState', fn ($q) => $q->whereBetweenString($request->started_at, 'project_project_state.created_at'));
        }
        if ($request->has('finished_at')) {
            $query->whereHas('lastFinishedState', fn ($q) => $q->whereBetweenString($request->finished_at, 'project_project_state.created_at'));
        }
        if ($request->has('budget_min')) {
            $query->where('net', '>=', $request->budget_min);
        }
        if ($request->has('assignee_id')) {
            $query->whereHas('assignees', fn ($q) => $q->where('assignee_id', $request->assignee_id)->where('assignee_type', 'App\Models\User'));
        }
        if ($request->has('project_manager_id')) {
            $query->where('project_manager_id', $request->project_manager_id);
        }
        $request['states'] = is_array($requestedStates) ? implode(',', $requestedStates) : $requestedStates;

        if ($request->has('sort_by') && $request->has('sort_direction')) {
            $query->orderBy($request->sort_by, $request->sort_direction);
        } else {
            $query->latest()->latest('net');
        }
        $query->with([
            'company',
            'hoursInvestedSum',
            'connectionProjects',
        ])->withLatestParams();

        if (@request('paginate') === 'true') {
            $replies = $query->paginate(50);
            $replies->withQueryString();
            $replies->setCollection($replies->getCollection()->appendProjectCollection());
        } else {
            $replies = $query->get();
            if ($request->has('withParents') && $request->withParents == true) {
                $replies = Project::withParentHierarchy($replies);
            }
            $replies = $replies->appendProjectCollection();
        }
        return $replies;
    }
    public function index(Request $request) {
        return $this->_index($request, Project::select());
    }
    public function indexForCompany(Request $request, Company $_) {
        return $this->_index($request, $_->projects());
    }
    public function indexCoParticipatedProjects(Request $request, Company $_) {
        $builder = Project::whereHas('connectionProjects', fn ($q) => $q->whereHas('connection', fn ($c) => $c->where('company1_id', $_->id)->orWhere('company2_id', $_->id)
        )
        )->where('company_id', '!=', $_->id);
        return $this->_index($request, $builder);
    }
    public function indexAssignees(Request $request, Project $_) {
        return $_->assignees()->latest('role_id')->with('assignee')->get();
    }
    public function indexComments(Request $request, Project $_) {
        return $_->comments;
    }
    public function indexInvoiceItems(Request $request, Project $_) {
        $query = $_->indexedItems()->withRequest();

        if ($request->boolean('support_only')) {
            return $query->whereNull('company_id')->whereNull('invoice_id')->get()->appendRequest();
        }

        $items = $query->withCount('billedFoci')->withSum('billedFoci', 'duration')->withSum('foci', 'duration')->get();
        $items->appendRequest();
        $items->append(['progress']);
        return $items;
    }
    public function indexFeatures(Project $_) {
        $items = $_->invoiceItems()
            ->where('type', InvoiceItemType::Default)
            ->with([
                'productSource',
                'predictions',
                'fociUserSums',
                'milestones' => fn ($q) => $q->select('milestones.id', 'invoice_item_id', 'name', 'progress', 'state', 'flags', 'user_id')->without('invoiceItem'),
                'milestones.user:id,name,color',
            ])
            ->withCount('billedFoci')
            ->withSum('billedFoci', 'duration')
            ->withSum('foci', 'duration')
            ->oldest('position')
            ->get();

        $appends = ['foci_by_user', 'my_prediction'];
        if (! $_->is_time_based) {
            $appends[] = 'fociSum';
        }
        $items->each(fn ($item) => $item->append($appends));

        return $items;
    }
    public function indexInvoiceItemsForEstimation(Request $request, Project $_) {
        $query = $_->indexedItems()->with('predictions');

        if ($request->boolean('support_only')) {
            $items = $query->whereNull('company_id')->whereNull('invoice_id')->get();
        } else {
            $items = $query->withCount('billedFoci')->withSum('billedFoci', 'duration')->withSum('foci', 'duration')->get();
        }

        $financialFields = [
            'net',
            'gross',
            'total',
            'price',
            'price_discounted',
            'discount',
            'vat_calculation',
            'vat_rate',
            'vat_rate_dec',
            'vat_reason',
            'unit_factor',
        ];

        $items->each(function (InvoiceItem $item) use ($financialFields) {
            $item->append(['my_prediction', 'progress']);
            $item->makeHidden($financialFields);
        });

        return $items;
    }
    public function indexQuoteDescriptions(Project $_) {
        return $_->getQuoteDescriptions();
    }
    public function indexFoci(Request $request, Project $_) {
        return $this->_indexFoci($request, $_);
    }
    public function indexConnectionProjects(Request $request, Project $_) {
        return $_->connectionProjects()->get()->mapSimplified($_);
    }
    public function storeConnectionProject(StoreConnectionProjectRequest $request, Project $_) {
        $connectionProject = ConnectionProject::create([
            'project_id'    => $_->id,
            'connection_id' => $request->validated('connection_id'),
        ]);
        return $connectionProject->load(['connection.company1', 'connection.company2']);
    }
    public function destroyConnectionProject(Request $request, Project $_, ConnectionProject $connectionProject) {
        if ($connectionProject->project_id !== $_->id) {
            return response()->json(['error' => 'ConnectionProject does not belong to this project'], 403);
        }

        $connectionProject->delete();
        return response()->json(['success' => true]);
    }
    public function makeInvoice(Project $_) {
        return $_->makeInvoiceFor();
    }
    public function moveSupportToCustomer(Project $_) {
        $_->moveItemsToCustomer($_->invoiceItems()->whereStage(1), ['stage' => 0]);
        return true;
    }
    public function moveRegularItemsToCustomer(Project $_) {
        $_->moveItemsToCustomer($_->invoiceItems()->orderBy('position'));
        return true;
    }
    public function convertSupportItemsToRegular(Project $_) {
        return ['converted' => $_->convertSupportItemsToRegular()];
    }
    public function update(UpdateProjectRequest $request, Project $project) {

        $previousState = $project->state;

        $project->applyAndSave($request);
        if ($request->has('state')) {
            $project->state = $request->state;
            $project        = $project->fresh('states');
        }

        if ($project->hasStateChangedTo(ProjectState::Prepared, $previousState)) {
            if (request()->user()->hasAnyRole(['admin', 'invoicing'])) {
                return;
            }
        }

        if ($request->has('state') && $project->state->progress !== $previousState->progress) {
            $project->handleStateTransition($previousState, $request->user()->id);
        }

        if ($request->has('project_id')) {
            $project->setParent($request->project_id);
            $project->save();
            $project->load('parentProject');
            $project->load('assignees');
        }

        return $project;
    }
    public function destroy(Request $request, Project $project) {
        return $project->delete();
    }
    public function postpone(PostponeRequest $request, Project $_) {
        return $_->postpone($request->validated('duration'), $request->validated('comment'));
    }
    public function duplicate(DuplicateProjectRequest $request, Project $_) {
        return $_->duplicate($request->validated('name'));
    }
    public function showReporting(Request $request) {
        return $this->projectReportingService->build(
            $request->input('start_date'),
            $request->input('end_date')
        );
    }
    public function show(Request $request, Project $project) {
        return $this->projectDetailsService->build($project);
    }
    public function storeAssignee(Request $request, Project $_) {
        return $_->addAssigneeFromRequest($request);
    }
    public function updateSetMainContact(UpdateMainContactRequest $request, Project $_) {
        $assignment = Assignment::findOrFail($request->validated('assignment_id'));

        if ($assignment->parent_id != $_->id) {
            return response()->json(['error' => 'Assignment does not belong to this project'], 403);
        }
        $_->setMainContactByAssignment($assignment);
        return response()->json(['success' => true, 'assignment_id' => $assignment->id]);
    }
    public function storeMilestone(MilestoneRequest $request, Project $_) {
        $data = $request->validated();

        $data['name']     = $data['name'] ?? 'New Milestone';
        $data['duration'] = $data['duration'] ?? 1;
        $data['progress'] = $data['progress'] ?? 0;
        $data['state']    = $data['state'] ?? 0;

        if (! isset($data['started_at'])) {
            $data['started_at'] = now()->toDateString();
        }
        if (! isset($data['due_at'])) {
            $data['due_at'] = now()->addDays(7)->toDateString();
        }

        if (! isset($data['user_id'])) {
            $data['user_id'] = request()->user()->id;
        }

        if (! isset($data['position'])) {
            $maxPosition      = $_->milestones()->max('position') ?? -1;
            $data['position'] = $maxPosition + 1;
        }

        unset($data['project_id']);
        return $_->milestones()->create($data);
    }
    public function indexMilestones(Request $request, Project $_) {
        return $this->projectMilestonesService->build($_, $request->user()->id);
    }
    public function convertInvoiceItemsToMilestones(Request $request, Project $_) {
        return response()->json($_->convertItemsToMilestones());
    }
    public function makeQuote(Project $_) {
        return $_->makeQuote();
    }
    public function indexFrameworks(Request $request) {
        return $this->projectFrameworksService->index();
    }
    public function updateFrameworks(UpdateFrameworksRequest $request) {
        $validated = $request->validated();
        $updated   = PluginLink::where('url', $validated['url'])->update([
            'is_deprecated' => $validated['is_deprecated'] ?? false,
        ]);
        return response()->json([
            'success' => true,
            'updated' => $updated,
        ]);
    }
    public function indexFrameworksLatest(Request $request) {
        return Framework::where('name', '!=', 'unknown')
            ->whereNotNull('latest_version')
            ->select('id', 'name', 'latest_version')
            ->get();
    }
    public function indexMissingGit(Request $request) {
        return Project::whereRunning()
            ->whereNot('is_internal', true)
            ->where('no_git_required', false)
            ->whereDoesntHave('pluginLinks', fn ($q) => $q->where('type', 'git'))
            ->with(['company', 'latestState'])
            ->latest()
            ->get()
            ->append(['net_remaining', 'hours_invested']);
    }

    public function indexOverrunRisk(Request $request) {
        return Project::whereRunning()
            ->whereBudgetBased()
            ->whereNotNull('work_estimated')
            ->where('work_estimated', '>', 0)
            ->whereNotNull('ml_predicted_hours')
            ->whereColumn('ml_predicted_hours', '>', 'work_estimated')
            ->with(['company', 'latestState'])
            ->get()
            ->append(['ml_overrun_ratio'])
            ->sortByDesc('ml_overrun_ratio')
            ->values();
    }

    public function resolvePluginLinkUrls(Request $request) {
        return $this->projectPluginLinkResolverService->resolve((array)$request->input('urls', []));
    }
    public function showPaymentPlan(Project $_) {
        return $_->getPaymentPlanOverview();
    }
    public function showQuoteAcceptancePrediction(Project $_) {
        $result = $this->projectQuoteAcceptanceService->build($_);
        if ($result === null) {
            return response()->json(['error' => 'No trained quote-acceptance model available yet.'], 422);
        }
        return $result;
    }
}
