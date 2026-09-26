<?php

namespace App\Models;

use App\Actions\User\CalculateUserWorkloadStats;
use App\Actions\User\GetFocusAccuracyData;
use App\Actions\User\GetPredictionAccuracyData;
use App\Actions\User\GetUserAddressBook;
use App\Builders\UserBuilder;
use App\Casts\Permission;
use App\Enums\MilestoneState;
use App\Enums\VacationState;
use App\Http\Controllers\VacationController;
use App\Queries\TimeBasedEmploymentQuery;
use App\Traits\CustomModelTrait;
use App\Traits\HasFocusDisplay;
use App\Traits\HasI18nTrait;
use App\Traits\HasParams;
use App\Traits\HasTasksTrait;
use App\Traits\VcardGenderTrait;
use App\Traits\VcardTrait;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends BaseAuthenticatable {
    use CustomModelTrait;
    use HasApiTokens;
    use HasFactory;
    use HasFocusDisplay;
    use HasI18nTrait;
    use HasParams;
    use HasRoles {
        assignRole as private spatieAssignRole;
        removeRole as private spatieRemoveRole;
        syncRoles as private spatieSyncRoles;
    }
    use HasTasksTrait;
    use Notifiable;
    use VcardGenderTrait;
    use VcardTrait;

    protected $hidden   = ['password', 'remember_token', 'created_at', 'updated_at', 'deleted_at', 'api_token'];
    protected $with     = ['activeEmployment'];
    protected $appends  = ['icon', 'class', 'is_retired', 'name', 'path', 'gender'];
    protected $fillable = ['color', 'current_focus_id', 'current_focus_type', 'name', 'email', 'password', 'vcard', 'work_zip'];

    /** @var array<int|string, string[]> */
    private static array $roleNames = [];

    protected function casts(): array {
        return [
            'revenue' => Permission::class.':financial',
        ];
    }
    public function getPredictionAccuracyData($startDate): array {
        return app(GetPredictionAccuracyData::class)->execute($this, $startDate);
    }
    public function getFocusAccuracyData($startDate): array {
        return app(GetFocusAccuracyData::class)->execute($this, $startDate);
    }
    public function getIconAttribute(): string {
        return 'users/'.$this->id.'/icon?'.($this->updated_at ? $this->updated_at->timestamp : '');
    }
    public function getIsRetiredAttribute(): bool {
        if ($this->relationLoaded('activeEmployment')) {
            return is_null($this->activeEmployment);
        }
        return ! $this->activeEmployments()->exists();
    }
    public function activeEmployment() {
        return $this->hasOne(UserEmployment::class)->where('is_active', true)->latest();
    }
    public function getIsSickAttribute(): ?Carbon {
        if ($this->relationLoaded('active_sick_notes')) {
            return $this->active_sick_notes->sortByDesc('id')->first()?->ended_at;
        }
        return $this->active_sick_notes()->latest()->first()?->ended_at;
    }
    public function getIsOnVacationAttribute(): ?Carbon {
        if ($this->relationLoaded('activeVacations')) {
            return $this->activeVacations->sortByDesc('id')->first()?->ended_at;
        }
        return $this->activeVacations()->latest()->first()?->ended_at;
    }
    public function getAvailabilityStatusAttribute(): int {
        if ($this->current_focus) {
            return 1;
        }
        if ($this->relationLoaded('activeVacations') ? $this->activeVacations->isNotEmpty() : $this->activeVacations()->count()) {
            return -1;
        }
        if ($this->relationLoaded('active_sick_notes') ? $this->active_sick_notes->isNotEmpty() : $this->active_sick_notes()->count()) {
            return -2;
        }
        return 0;
    }
    public function getHpdAttribute(): float {
        if (count($this->activeEmployments)) {
            $ae = $this->activeEmployments[0];
            return ($ae->mo + $ae->tu + $ae->we + $ae->th + $ae->fr) / 5;
        }
        return 8;
    }
    public function getHpw(): float {
        if (count($this->activeEmployments)) {
            $ae = $this->activeEmployments[0];
            return $ae->mo + $ae->tu + $ae->we + $ae->th + $ae->fr;
        }
        return 40;
    }
    public function getHpwArray(): array {
        if (count($this->activeEmployments)) {
            $ae = $this->activeEmployments[0];
            return [$ae->mo, $ae->tu, $ae->we, $ae->th, $ae->fr, 0, 0];
        }
        return [8, 8, 8, 8, 8, 0, 0];
    }
    public function getLatestFociAttribute() {
        if ($this->relationLoaded('foci')) {
            return $this->foci
                ->filter(fn ($focus) => $focus->parent_id && $focus->parent_type)
                ->unique(fn ($item) => $item->parent_type.':'.$item->parent_id)
                ->map(fn ($_) => $_->only(['id', 'parent_name', 'parent_path']))
                ->take(10)
                ->values();
        }
        return Focus::query()
            ->where('user_id', $this->id)
            ->whereNotNull('parent_id')
            ->whereNotNull('parent_type')
            ->latest()
            ->limit(100)
            ->with('parent')
            ->get()
            ->unique(fn ($item) => $item->parent_type.':'.$item->parent_id)
            ->map(fn ($_) => $_->only(['id', 'parent_name', 'parent_path']))
            ->take(10)
            ->values();
    }
    public function getRoleNamesAttribute() {
        return $this->getRoleNames();
    }

    public function hasRole($roles, ?string $guard = null): bool {
        return $this->hasAnyRole($roles, $guard);
    }

    public function hasAnyRole($roles, ?string $guard = null): bool {
        if (is_string($roles)) {
            $roles = explode('|', $roles);
        }

        $own = $this->roleNames();

        return in_array('admin', $own, true) || (bool)array_intersect($own, (array)$roles);
    }

    public function assignRole(...$roles) {
        return tap($this->spatieAssignRole(...$roles), fn () => $this->forgetRoleNames());
    }

    public function removeRole($role) {
        return tap($this->spatieRemoveRole($role), fn () => $this->forgetRoleNames());
    }

    public function syncRoles(...$roles) {
        return tap($this->spatieSyncRoles(...$roles), fn () => $this->forgetRoleNames());
    }

    private function forgetRoleNames(): void {
        unset(self::$roleNames[$this->getKey()]);
    }

    private function roleNames(): array {
        if ($this->relationLoaded('roles')) {
            return $this->roles->pluck('name')->all();
        }
        if (! $key = $this->getKey()) {
            return [];
        }
        return self::$roleNames[$key] ??= $this->roles()->pluck('name')->all();
    }

    public function comments() {
        return $this->hasMany(Comment::class);
    }
    public function foci() {
        return $this->hasMany(Focus::class);
    }
    public function current_focus() {
        return $this->morphTo();
    }
    public function assignments() {
        return $this->hasManyMorph(Assignment::class);
    }
    public function projects() {
        return $this->morphedByMany(Project::class, 'parent', 'assignments', 'assignee_id');
    }
    public function activeProjects() {
        return $this->projects()->whereProgress(ProjectState::Running)->withPivot('hours_planned', 'hours_weekly', 'id');
    }
    public function marketingInitiatives() {
        return $this->belongsToMany(MarketingInitiative::class, 'marketing_initiative_user')
            ->withPivot(['role', 'receives_notifications'])
            ->withTimestamps();
    }
    public function marketingProspects() {
        return $this->hasMany(MarketingProspect::class);
    }
    public function activeVacations() {
        return $this->approvedVacations()
            ->where('started_at', '<', now())
            ->where('ended_at', '>=', now()->startOfDay());
    }
    public function active_sick_notes() {
        return $this->vacations()
            ->whereState(VacationState::Sick)
            ->where('started_at', '<', now())
            ->where('ended_at', '>=', now()->startOfDay());
    }
    public function assigned_projects($state = [ProjectState::Running]) {
        return $this->projects()->withPivot('hours_planned', 'hours_weekly', 'id')->whereProgress(ProjectState::Running);
    }
    public function assigned_companies() {
        return $this->morphedByMany(Company::class, 'parent', 'assignments', 'assignee_id')->withPivot('hours_planned', 'hours_weekly', 'id');
    }
    public function group() {
        return $this->belongsTo(UserGroup::class);
    }
    public function sentinels() {
        return $this->hasMany(Sentinel::class);
    }
    public function subscribedSentinels() {
        return $this->belongsToMany(Sentinel::class, 'sentinel_users');
    }
    public function predictions() {
        return $this->hasMany(InvoiceItemPrediction::class);
    }
    public function encryptions() {
        return $this->hasMany(Encryption::class);
    }
    public function vacation_grants() {
        return $this->hasMany(VacationGrant::class);
    }
    public function vacations() {
        return $this->hasManyThrough(Vacation::class, VacationGrant::class);
    }
    public function approvedVacations(?Carbon $after = null, ?Carbon $before = null) {
        $query = $this->vacations()->where('state', VacationState::Approved)->where('vacations.amount', '<', '0');
        if ($after) {
            $query->where('ended_at', '>', $after);
        }
        if ($before) {
            $query->where('started_at', '<', $before);
        }
        return $query;
    }
    public function currentSickNotes(?Carbon $after = null, ?Carbon $before = null) {
        $query = $this->vacations()->where('state', VacationState::Sick);
        if ($after) {
            $query->where('ended_at', '>', $after);
        }
        if ($before) {
            $query->where('started_at', '<', $before);
        }
        return $query;
    }
    public function employments() {
        return $this->hasMany(UserEmployment::class);
    }
    public function activeEmployments() {
        return $this->employments()->where('is_active', true);
    }
    public function timePayments() {
        return $this->hasMany(UserPaidTime::class);
    }
    public function milestones() {
        return $this->hasMany(Milestone::class);
    }
    public function getBreakDays(Carbon $startDate, Carbon $endDate): array {
        $breakMap = [];

        $approvedVacations = $this->approvedVacations($startDate->copy()->subDay(), $endDate->copy()->addDay())->get();
        foreach ($approvedVacations as $vac) {
            foreach (CarbonPeriod::create($vac->started_at, $vac->ended_at) as $date) {
                $breakMap[$date->format('Y-m-d')] = ['type' => 'vacation', 'name' => $vac->comment ?: 'Vacation'];
            }
        }

        $sickNotes = $this->currentSickNotes($startDate->copy()->subDay(), $endDate->copy()->addDay())->get();
        foreach ($sickNotes as $sick) {
            foreach (CarbonPeriod::create($sick->started_at, $sick->ended_at) as $date) {
                $breakMap[$date->format('Y-m-d')] = ['type' => 'sick', 'name' => 'Sick leave'];
            }
        }

        $holidays = app(VacationController::class)->indexHolidays($this->work_zip ?? '87435');
        foreach ($holidays as $holiday) {
            $holidayDate = Carbon::parse($holiday->datum);
            if ($holidayDate->between($startDate, $endDate)) {
                $breakMap[$holidayDate->format('Y-m-d')] = ['type' => 'holiday', 'name' => $holiday->name];
            }
        }
        return $breakMap;
    }
    public function getWeeklyAssignments(): array {
        $assignments = [];
        $meId        = (int)Param::get('ME_ID')->value;

        $allAssignments = Assignment::where('assignee_id', $this->id)
            ->where('assignee_type', self::class)
            ->where('hours_weekly', '>', 0)
            ->with('parent')
            ->get();

        foreach ($allAssignments as $assignment) {
            $parent    = $assignment->parent;
            $isProject = $assignment->parent_type === Project::class;
            $isCompany = $assignment->parent_type === Company::class;

            if (! $parent) {
                continue;
            }
            if ($isCompany && ((int)$parent->id) === $meId) {
                continue;
            }
            if ($isProject && ((int)$parent->company_id) === $meId) {
                continue;
            }

            $assignments[] = [
                'id'           => $assignment->id,
                'name'         => $parent->name ?? 'Unknown',
                'hours_weekly' => $assignment->hours_weekly,
                'project'      => $isProject ? $parent : null,
                'project_id'   => $isProject ? $parent->id : null,
                'project_path' => $isProject ? '/projects/'.$parent->id : '/customers/'.$parent->id,
            ];
        }
        return $assignments;
    }
    public function milestonesInRange(Carbon $startDate, Carbon $endDate) {
        $meId = (int)Param::get('ME_ID')->value;
        return Milestone::where('user_id', $this->id)
            ->whereNot('state', MilestoneState::DONE)
            ->where(function ($query) use ($startDate, $endDate) {
                $query->whereDate('due_at', '>=', $startDate)
                    ->where(function ($q) use ($endDate) {
                        $q->whereDate('started_at', '<=', $endDate)->orWhereNull('started_at');
                    });
            })
            ->with(['project', 'invoiceItems'])
            ->whereHas('project', fn ($q) => $q->where('company_id', '!=', $meId))
            ->get();
    }
    public function getUnconfiguredMilestones(): array {
        return Milestone::where('user_id', $this->id)
            ->where(function ($query) {
                $query->whereNull('workload_hours')->orWhere('workload_hours', 0);
            })
            ->whereNot('state', MilestoneState::DONE)
            ->whereDoesntHave('invoiceItems')
            ->whereHas('project', fn ($q) => $q->where('is_time_based', false))
            ->with('project')
            ->get()
            ->map(fn ($m) => [
                'id'           => $m->id,
                'name'         => $m->name,
                'project'      => $m->project,
                'project_id'   => $m->project_id,
                'project_name' => $m->project?->name,
                'due_at'       => $m->due_at,
                'started_at'   => $m->started_at,
            ])
            ->toArray();
    }
    public function getAddressBook(): array {
        return app(GetUserAddressBook::class)->execute($this);
    }
    public function getDashboards() {
        $dashboards = $this->param('DASHBOARDS')?->value;
        if (! $dashboards) {
            $dashboards            = '[]';
            $dashboardParam        = $this->param('DASHBOARDS');
            $dashboardParam->value = $dashboards;
            $dashboardParam->save();
        }
        return json_decode($dashboards);
    }
    public function getTimeBasedEmploymentInfo(): ?array {
        return app(TimeBasedEmploymentQuery::class)->getInfo($this);
    }
    public function getTimeBasedEmploymentTable(): ?array {
        return app(TimeBasedEmploymentQuery::class)->getTable($this);
    }
    public function newEloquentBuilder($query) {
        return new UserBuilder($query);
    }
    public function getWorkloadStats(array $workData, array $holidays): array {
        return app(CalculateUserWorkloadStats::class)->execute($this, $workData, $holidays);
    }
}
