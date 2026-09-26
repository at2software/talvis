<?php

namespace App\Http\Controllers;

use App\Actions\User\CalculateDailyWorkload;
use App\Enums\CommentType;
use App\Enums\InvoiceItemType;
use App\Enums\InvoiceVatHandling;
use App\Helpers\ModelRelationship;
use App\Http\Requests\User\CreateTbeRequest;
use App\Http\Requests\User\StoreEmploymentRequest;
use App\Http\Requests\User\StoreUserRequest;
use App\Models\LeadSource;
use App\Models\Milestone;
use App\Models\Param;
use App\Models\Project;
use App\Models\ProjectState;
use App\Models\Task;
use App\Models\User;
use App\Models\UserEmployment;
use App\Models\UserPaidTime;
use App\Models\Vault;
use App\Models\Vcard;
use App\Services\DatabaseSchemaService;
use App\Services\User\UserProjectLoadService;
use App\Services\UserTimelineService;
use App\Traits\HasParams;
use Carbon\Carbon;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserController extends Controller {
    const ERROR_404   = 'email not found or password incorrect';
    const ERROR_TOKEN = 'Invalid api_token';

    protected $exceptedMiddlewares = ['showEnvironment', 'login'];

    public function __construct(private UserProjectLoadService $userProjectLoadService) {}

    public function index(Request $request) {
        return User::get()
            ->map(function ($user) {
                $user['hr_stress'] = round(100 * $user->foci()->where('created_at', '>', now()->subWeeks(2))->sum('duration') / 80);
                return $user;
            })
            ->sortBy('is_retired')
            ->sortByDesc('hr_stress')->values();
    }
    public function store(StoreUserRequest $request) {
        $validated = $request->validated();

        $firstName  = $validated['first_name'] ?? '';
        $familyName = $validated['family_name'] ?? '';

        if (! $firstName && ! $familyName && ($validated['name'] ?? null)) {
            $parts      = explode(' ', $validated['name'], 2);
            $firstName  = $parts[0];
            $familyName = $parts[1] ?? '';
        }

        $fullName = trim($firstName.' '.$familyName) ?: $validated['name'];

        $vcard = new Vcard;
        $vcard->setProperty('FN', $fullName);
        $vcard->setProperty('N', [$familyName, $firstName, '', '', ''], ['charset' => 'utf-8']);
        $vcard->setProperty('EMAIL', $validated['email'], ['type' => 'work']);

        $user = User::create([
            'name'      => $fullName,
            'email'     => $validated['email'],
            'password'  => Hash::make($validated['password']),
            'api_token' => Str::random(60),
            'vcard'     => $vcard->toVCardString(false),
        ]);

        if (isset($validated['employment'])) {
            $emp       = $validated['employment'];
            $type      = $emp['type'] ?? 'Festanstellung';
            $hpw       = (float)($emp['hpw'] ?? 40);
            $hpd       = $hpw / 5;
            $start     = $emp['started_at'] ?? now()->format('Y-m-d');
            $timeBased = ['Werkstudent'];

            UserEmployment::create([
                'user_id'       => $user->id,
                'description'   => $type,
                'mo'            => $hpd,
                'tu'            => $hpd,
                'we'            => $hpd,
                'th'            => $hpd,
                'fr'            => $hpd,
                'sa'            => 0,
                'su'            => 0,
                'is_time_based' => in_array($type, $timeBased),
                'started_at'    => $start,
                'is_active'     => true,
            ]);
        }
        return $user;
    }
    public function indexFoci(Request $request, User $_) {
        return $_->foci()->with('parent', 'invoiceItem')->latest('started_at')->paginate(100)->withQueryString();
    }
    public function indexPmMilestones(Request $request, User $_) {
        $result = $this->indexMilestones($request, $_, true);

        $meId = Param::get('ME_ID')->value;

        $projectsNoCoverage = Project::whereRunning()
            ->where('project_manager_id', $_->id)
            ->where('is_time_based', false)
            ->where('company_id', '!=', $meId)
            ->with([
                'company',
                'milestones' => function ($q) {
                    $q->select('id', 'project_id', 'workload_hours')
                        ->with('invoiceItems:id,company_id,project_id,net,type,unit_name,qty');
                },
            ])
            ->get()
            ->filter(function ($project) {
                $milestoneHours = $project->milestones->sum(function ($milestone) {
                    if ($milestone->workload_hours !== null && $milestone->workload_hours > 0) {
                        return $milestone->workload_hours;
                    }
                    return $milestone->invoiceItems->sum(fn ($item) => $item->assumedWorkload());
                });
                return $milestoneHours <= 0;
            })
            ->map(function ($project) {
                return [
                    'id'              => $project->id,
                    'name'            => $project->name,
                    'icon'            => $project->icon,
                    'company_id'      => $project->company_id,
                    'company_name'    => $project->company->name ?? '',
                    'estimated_hours' => round($project->work_estimated ?? 0, 1),
                    'milestone_count' => $project->milestones->count(),
                ];
            })
            ->values();
        return [
            'milestones'           => $result,
            'projects_no_coverage' => $projectsNoCoverage,
        ];
    }
    public function indexMilestones(Request $request, User $_, bool $pm = false) {
        if ($pm) {
            $milestonesGrouped = Milestone::whereHas('project', fn ($query) => $query->where('project_manager_id', $_->id)->whereRunning());
        } else {
            $milestonesGrouped = $_->milestones()->whereHas('project', fn ($q) => $q->whereRunning());
        }

        $milestonesGrouped = $milestonesGrouped
            ->with([
                'project' => function ($q) {
                    $q->with([
                        'assignees' => function ($q2) {
                            $q2->with('assignee');
                        },
                        'company',
                    ]);
                },
                'dependees',
                'dependants',
                'invoiceItems:id,company_id,project_id,net',
                'user:id,vcard',
            ])
            ->orderBy('position')
            ->get()
            ->groupBy('project_id');

        $projectIds   = $milestonesGrouped->keys();
        $milestoneIds = $milestonesGrouped->flatten(1)->pluck('id');

        $projectTasksGrouped = Task::where('parent_type', 'App\\Models\\Project')
            ->whereIn('parent_id', $projectIds)
            ->with('assignee.assignee')
            ->get()
            ->groupBy('parent_id');

        $milestoneTasksGrouped = Task::where('parent_type', 'App\\Models\\Milestone')
            ->whereIn('parent_id', $milestoneIds)
            ->with('assignee.assignee')
            ->get()
            ->groupBy('parent_id');
        return $milestonesGrouped->map(function ($milestones, $projectId) use ($projectTasksGrouped, $milestoneTasksGrouped) {
            $project = $milestones->first()->project;
            $project->makeHidden(['params']);
            $projectTasks = $projectTasksGrouped->get($projectId, collect());

            $milestones->each(fn ($milestone) => $milestone
                ->setRelation('tasks', $milestoneTasksGrouped->get($milestone->id, collect()))
                ->makeHidden('project'));
            return [
                'project'       => $project,
                'project_tasks' => $projectTasks,
                'milestones'    => $milestones->values(),
            ];
        })->values();
    }
    public function update(Request $request, User $user) {
        $isOwnProfile = $request->user()->id === $user->id;

        if (! $isOwnProfile && ! $request->user()->hasRole('hr')) {
            abort(403, 'Unauthorized');
        }

        if ($request->has('is_retired') && Auth::user()->hasAnyRole(['admin', 'hr'])) {
            $user->employments->each(function ($_) {
                $_->is_active = false;
                $_->save();
            });
            $user->syncRoles([]);
            return $user;
        }
        if ($request->has('hpw') && Auth::user()->hasAnyRole(['admin', 'hr'])) {
            $days       = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
            $validation = array_merge(...array_map(fn ($_): array => ["hpw.$_" => 'required|numeric'], $days));
            $request->validate($validation);
            $validated  = $request->only(array_keys($validation));
            $employment = $user->activeEmployment;
            $employment->fill($validated['hpw']);
            $employment->save();
        }
        if ($request->has('user_group') && Auth::user()->hasAnyRole(['admin', 'hr'])) {
            $request->validate([
                'user_group' => 'nullable|in:admin,project_manager,user,guest,invoicing,financial,marketing,hr,product_manager',
            ]);
            $roles = $request->get('user_group', []);
            $user->syncRoles($roles);
            return $user;
        }
        $user->applyAndSave($request);
        $user->load('activeEmployment');
        return $user;
    }
    public function show(User $user) {
        return $user->load('activeEmployment');
    }
    public function login(Request $request) {
        if ($request->hasHeader('Authorization')) {
            $token = preg_replace('/^Bearer /is', '', $request->header('Authorization'));
            if (strlen($token) === 0) {
                return response()->make(self::ERROR_TOKEN, 403);
            }
            try {
                $user = User::where('api_token', $token)->firstOrFail();
            } catch (Exception $ex) {
                return response()->make(self::ERROR_TOKEN, 403);
            }
            Auth::setUser($user);
            $user->makeVisible('api_token');
            return $this->showEnvironment();
        } else {
            $data = json_decode($request->getContent());
            if (empty($data->email)) {
                return response()->make('Login not set', 403);
            }
            if (empty($data->password)) {
                return response()->make('Password not set', 403);
            }
            try {
                $user = User::where('email', $data->email)->firstOrFail();
            } catch (Exception $ex) {
                return response()->make(self::ERROR_404, 403);
            }
            if (! Hash::check($data->password, $user->password)) {
                return response()->make(self::ERROR_404, 403);
            }
            Auth::setUser($user);
            $user->api_token = Str::random(60);
            $user->save();
            $user->makeVisible('api_token');
            return $this->showEnvironment();
        }
    }
    public function showEnvironment() {
        $user = Auth::user()->load('activeEmployment', ...HasParams::$WITH)->append(['role_names', 'params']);

        $team = User::with(['encryptions', 'activeEmployment', 'roles', ...HasParams::$WITH])
            ->get()
            ->sortBy('is_retired')
            ->map(function ($user) {
                if (! $user->is_retired) {
                    $user->encryptions->each(fn ($e) => $e->makeHidden(['value', 'created_at', 'updated_at', 'flags']));
                }
                $user->append('role_names');

                $user->setAttribute('bias_factor', $user->params['STATS_PREDICTION_BIAS'] ?? null);
                return $user;
            });

        $leadSources   = LeadSource::all();
        $projectStates = ProjectState::all();
        $plugins       = Vault::indexVaults()->filter(fn ($_) => $_['active']);

        $roles = [];
        if ($user->hasRole('admin')) {
            $roleController = new RoleController;
            $rolesData      = $roleController->index();
            $roles          = $rolesData['roles'] ?? [];
        }

        $object = collect([
            'version'        => 1,
            'user'           => $user,
            'dashboards'     => $user->getDashboards(),
            'encryptions'    => $user->encryptions,
            'eu_countries'   => $this->getCachedEuCountries(),
            'lead_sources'   => $leadSources,
            'team'           => $team,
            'settings'       => Param::index(),
            'tables'         => $this->getCachedTables(),
            'relations'      => ModelRelationship::RELATIONSHIPS,
            'accessors'      => ModelRelationship::ACCESSORS,
            'project_states' => $projectStates,
            'plugins'        => $plugins,
            'enums'          => $this->getCachedEnums(),
            'roles'          => $roles,
        ]);
        return $object;
    }
    public function getTables() {
        return (new DatabaseSchemaService)->getTables();
    }
    private function getCachedTables() {
        return Cache::remember(DatabaseSchemaService::CACHE_KEY, now()->addDay(), fn () => $this->getTables());
    }
    private function getCachedEuCountries() {
        return collect(config('eu.countries'));
    }
    private function getCachedEnums() {
        return collect([
            $this->enumClass(InvoiceItemType::class)    => InvoiceItemType::asArray(),
            $this->enumClass(InvoiceVatHandling::class) => InvoiceVatHandling::asArray(),
            $this->enumClass(CommentType::class)        => CommentType::asArray(),
        ]);
    }
    public function destroy(User $user) {
        if (! Auth::user()->hasRole('admin')) {
            abort(403, 'Unauthorized');
        }
        $user->delete();
        return response()->noContent();
    }
    public function resetPassword(Request $request, User $user) {
        $request->validate([
            'password' => 'required|string|min:8',
        ]);
        $user->password = Hash::make($request->password);
        $user->save();
        return response()->noContent();
    }
    public function storeEmployment(StoreEmploymentRequest $request) {
        return UserEmployment::create((array)$this->getBody());
    }
    public function updateEmployment(Request $request, User $_, UserEmployment $id) {
        return $id->applyAndSave($request);
    }
    public function deleteEmployment(User $_, UserEmployment $id) {
        return $id->delete();
    }
    public function enumClass($string) {
        return substr($string, strrpos($string, '\\') + 1);
    }
    public function showTimeBasedEmploymentInfo(User $_) {
        $_->employments;
        $_->tbe_projects = $_->getTimeBasedEmploymentInfo();
        $_->tbe_table    = $_->getTimeBasedEmploymentTable();
        $_->roles        = $_->getRoleNames();
        return $_;
    }
    public function showFoci30D(User $_) {
        return $_->foci()
            ->selectRaw('parent_id, parent_type, SUM(duration) AS duration')
            ->groupBy('parent_id')
            ->groupBy('parent_type')
            ->with('parent')
            ->whereAfter(now()->startOfDay()->subDays(30))
            ->get();
    }
    public function createTbe(CreateTbeRequest $request, User $_) {
        $data = $this->getBody();
        return UserPaidTime::create([
            'paid_at'            => $data->paid_at,
            'user_id'            => $_->id,
            'granted_by_user_id' => request()->user()->id,
            'raw'                => $data->raw,
            'description'        => 'Bezahlte Zeit '.$data->paid_at,
            'vacation'           => $data->vacation,
        ]);
    }
    public function generateTimeline(User $user, $plannedSubscriptions = null, $remainingHpw = 40, $withoutSubscriptions = false): array {
        return (new UserTimelineService)->generate($user, $plannedSubscriptions, $remainingHpw, $withoutSubscriptions);
    }
    public function indexProjectLoad(User $_) {
        return $this->userProjectLoadService->build($_);
    }
    public function indexDailyWorkload(Request $request, User $_) {
        $startDate = $request->has('start')
            ? Carbon::parse($request->get('start'))->startOfDay()
            : now()->startOfDay();

        $endDate = $request->has('end')
            ? Carbon::parse($request->get('end'))->endOfDay()
            : now()->addMonths(3)->endOfDay();
        return app(CalculateDailyWorkload::class)->execute($_, $startDate, $endDate);
    }
}
