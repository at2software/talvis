<?php

namespace Database\Seeders;

use App\Models\Assignment;
use App\Models\Company;
use App\Models\CompanyContact;
use App\Models\Contact;
use App\Models\FloatParam;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Product;
use App\Models\ProductGroup;
use App\Models\Project;
use App\Models\ProjectState;
use App\Models\StringParam;
use App\Models\User;
use App\Models\UserEmployment;
use App\Models\VacationGrant;
use Carbon\Carbon;
use Illuminate\Contracts\Database\Eloquent\Builder;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Request;

class DemoSeeder extends Seeder {
    private ?DemoSeederData $_DemoSeederData = null;

    private function demoSeederData(): DemoSeederData {
        return $this->_DemoSeederData ??= new DemoSeederData;
    }
    public function run(): void {
        $startDay = Carbon::now()->subYears(5)->startOfMonth();

        $this->createSystemParams();
        $this->createUsers($startDay);
        $this->createProductGroups();
        $this->createProducts();
        $this->createOrgaProject();
        $this->createUserEmployments($startDay);
        $this->createVacationGrants($startDay);

        $dayOneUsers = User::query()->where('created_at', '<=', $startDay->copy()->addDay())->get();
        foreach ($dayOneUsers as $activeUser) {
            $customer       = $this->createNewCustomer($startDay);
            $project        = $customer['project'];
            $project->state = 2;
            $project->save();
            $this->createNewAssignment($startDay, $project, $activeUser);
        }

        $this->createPerDayActivities($startDay);

        $this->createParamHistory($startDay);
    }

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    public function createSystemParams(): void {
        $this->setParam('INVOICE_NO_PREFIX', 'RE', StringParam::class, false);
        $this->setParam('INVOICE_NO_CURRENT', 1, FloatParam::class, false);
        $this->setParam('INVOICE_NO_DIGITS', 4, FloatParam::class, false);
        $this->setParam('INVOICE_NO_SUFFIX', '', StringParam::class, false);
        $this->setParam('INVOICE_DEFAULT_VAT', 19, FloatParam::class, false);
        $this->setParam('INVOICE_PAYMENT_DURATION', 14, FloatParam::class, false);
        $this->setParam('INVOICE_GRACE_PERIOD', 7, FloatParam::class, false);
        $this->setParam('INVOICE_HOURLY_WAGE', 110, FloatParam::class, false);
        $this->setParam('INVOICE_HPD', 8, FloatParam::class, false);

        $this->setParam('HR_HOURLY_WAGE', 90, FloatParam::class, true);
        $this->setParam('HR_HPD', 7.8, FloatParam::class, true);
        $this->setParam('HR_WORKDAYS', 21, FloatParam::class, true);
    }
    private function setParam(string $key, $value, string $type, bool $history): void {
        $param        = Param::get($key, ['type' => $type, 'history' => $history]);
        $param->value = $value;
        $param->save();
    }
    public function createUsers(Carbon $startDay): void {
        $users = $this->demoSeederData()->users($startDay);

        foreach ($users as $user) {
            $hiredAt = $user['hired_at'];
            $role    = $user['role'];
            unset($user['hired_at'], $user['role']);

            $request = Request::create('/', 'POST', $user);

            $newUser = new User;
            $newUser->applyAndSave($request);
            $newUser->assignRole($role);
            $newUser->password = $user['password'];
            $newUser->save();

            DB::table('users')->where('id', $newUser->id)->update([
                'created_at' => $hiredAt->toDateTimeString(),
                'updated_at' => $hiredAt->toDateTimeString(),
            ]);
        }
    }
    public function createUserEmployments(Carbon $startDay): void {
        $users    = $this->demoSeederData()->users($startDay);
        $allUsers = User::orderBy('created_at')->get();

        foreach ($allUsers as $i => $user) {
            $hiredAt = Carbon::parse($user->created_at ?? $startDay);
            UserEmployment::create([
                'user_id'       => $user->id,
                'is_active'     => true,
                'is_time_based' => false,
                'mo'            => 8,
                'tu'            => 8,
                'we'            => 8,
                'th'            => 8,
                'fr'            => 8,
                'sa'            => 0,
                'su'            => 0,
                'started_at'    => $hiredAt,
                'description'   => 'Vollzeit',
                'created_at'    => $hiredAt,
                'updated_at'    => $hiredAt,
            ]);
        }
    }
    public function createVacationGrants(Carbon $startDay): void {
        $allUsers = User::orderBy('created_at')->get();
        $current  = $startDay->copy()->startOfYear();
        $end      = Carbon::now()->endOfYear();

        while ($current->lte($end)) {
            foreach ($allUsers as $user) {
                $hiredAt = Carbon::parse(DB::table('users')->where('id', $user->id)->value('created_at'));
                if ($hiredAt->year > $current->year) {
                    continue;
                }
                VacationGrant::create([
                    'user_id'    => $user->id,
                    'name'       => 'Jahresurlaub '.$current->year,
                    'amount'     => 30,
                    'expires_at' => $current->copy()->endOfYear()->addMonths(3),
                    'created_at' => $current,
                    'updated_at' => $current,
                ]);
            }
            $current->addYear();
        }
    }
    public function createProductGroups(): void {
        foreach ($this->demoSeederData()->product_groups() as $productGroup) {
            $request = Request::create('/', 'POST', ['name' => $productGroup]);
            (new ProductGroup)->applyAndSave($request);
        }
    }
    public function createProducts(): void {
        foreach ($this->demoSeederData()->products() as $product) {
            $request = Request::create('/', 'POST', $product);
            (new Product)->applyAndSave($request);
        }
    }
    public function createOrgaProject(): void {
        $orgaProject = new Project;
        $orgaProject->applyAndSave(Request::create('/', 'POST', [
            'name'          => 'Orga',
            'description'   => '',
            'is_internal'   => true,
            'is_time_based' => true,
            'company_id'    => null,
        ]));
        $orgaProject->state = 2;
    }

    // -------------------------------------------------------------------------
    // Daily simulation
    // -------------------------------------------------------------------------

    public function createPerDayActivities(Carbon $startDay): void {
        $currentDay = $startDay->copy();
        $endDay     = Carbon::now();

        while ($currentDay->lte($endDay)) {
            $this->dailyActivity($currentDay);
            $currentDay->addDay();
        }
    }
    public function dailyActivity(Carbon $currentDay): void {
        if ($currentDay->isWeekend()) {
            return;
        }

        $activeUsers = User::query()
            ->whereNull('deleted_at')
            ->where('created_at', '<=', $currentDay->toDateTimeString())
            ->get();

        foreach ($activeUsers as $activeUser) {
            $this->userWorksADay($currentDay, $activeUser);
        }

        $userCount = $activeUsers->count();

        $percentage_new_customer = max(3, min(10, $userCount * 2));
        $percentage_new_project  = max(3, min(8, $userCount));
        $percentage_project_won  = 5;

        if (rand(1, 100) <= $percentage_new_customer) {
            $this->createNewCustomer($currentDay);
        }
        if (rand(1, 100) <= $percentage_new_project) {
            $company = Company::inRandomOrder()->first();
            if ($company) {
                $this->createNewProject($company);
            }
        }

        if (rand(1, 100) <= $percentage_project_won) {
            $project = Project::query()->whereProgress(ProjectState::Prepared)->inRandomOrder()->first();
            if ($project) {
                $project->state = 2;
                $project->save();

                $userWithLeast = User::with([
                    'assignments' => function (Builder $query) {
                        $query->where('parent_type', Project::class)
                            ->whereHasMorph('parent', [Project::class], function (Builder $query) {
                                $query->whereProgress(ProjectState::Running);
                            });
                    },
                    'foci' => function (Builder $query) {
                        $query->where('parent_type', Project::class)
                            ->whereHasMorph('parent', [Project::class], function (Builder $query) {
                                $query->whereProgress(ProjectState::Running);
                            });
                    },
                ])->get()->map(function ($user) {
                    $user->open_hours = $user->assignments->sum('hours_planned') - $user->foci->sum('duration');
                    return $user;
                })->sortBy('open_hours')->first();

                if ($userWithLeast) {
                    $this->createNewAssignment($currentDay, $project, $userWithLeast);
                }
            }
        }

        foreach (Project::query()->whereProgress(ProjectState::Running)->get() as $project) {
            $percentageDone = $project->progress;
            if ($percentageDone <= 80) {
                $chance = 0;
            } elseif ($percentageDone >= 150) {
                $chance = 100;
            } else {
                $chance = ($percentageDone - 80) / (150 - 80) * 100;
            }
            if ($chance >= rand(1, 100)) {
                $project->state = 4;
                $project->save();
                $project->company->makeInvoiceFor();
            }
        }

        foreach (Invoice::whereNull('paid_at')->get() as $unpaidInvoice) {
            if (rand(1, 100) <= 2) {
                $unpaidInvoice->paid_at = $currentDay;
                $unpaidInvoice->save();
            }
            $remindAt = Carbon::parse($unpaidInvoice->remind_at);
            if ($currentDay->isSameDay($remindAt)) {
                $unpaidInvoice->sendReminder();
            }
        }
    }
    public function userWorksADay(Carbon $date, User $user): void {
        $minutesThatDay     = rand(7 * 60, 9 * 60);
        $minutesBeforeBreak = $minutesThatDay * rand(30, 70) / 100;
        $minutesAfterBreak  = $minutesThatDay - $minutesBeforeBreak;
        $minutesForBreak    = rand(30, 90);

        $startFirstShift  = $date->clone()->setTime(rand(8, 10), rand(0, 59), 0);
        $startSecondShift = $startFirstShift->clone()->addMinutes($minutesBeforeBreak + $minutesForBreak);

        $projects = $user->activeProjects;
        if ($projects->isNotEmpty()) {
            $this->createNewFocus($projects->random(), $user, $startFirstShift, $minutesBeforeBreak / 60.0);
            $this->createNewFocus($projects->random(), $user, $startSecondShift, $minutesAfterBreak / 60.0);
        }
    }

    // -------------------------------------------------------------------------
    // Param history
    // -------------------------------------------------------------------------

    public function createParamHistory(Carbon $startDay): void {
        $current = $startDay->copy()->startOfMonth();
        $end     = Carbon::now()->startOfMonth();

        $expensesParam    = Param::get('CASHFLOW_ANNUAL_EXPENSES', ['type' => FloatParam::class, 'history' => true]);
        $bankParam        = Param::get('CASHFLOW_BANK_BALANCE', ['type' => FloatParam::class, 'history' => true]);
        $hrWageParam      = Param::get('HR_HOURLY_WAGE', ['type' => FloatParam::class, 'history' => true]);
        $hrHpdParam       = Param::get('HR_HPD', ['type' => FloatParam::class, 'history' => true]);
        $hrWorkdaysParam  = Param::get('HR_WORKDAYS', ['type' => FloatParam::class, 'history' => true]);
        $invoicesDegParam = Param::get('INVOICE_DEG_12M', ['type' => FloatParam::class, 'history' => true]);

        $bankBalance   = 45000.0;   // starting cash position
        $monthsElapsed = 0;

        while ($current->lte($end)) {
            $snapshotDate = $current->copy()->endOfMonth()->subDay();

            $employeeCount = DB::table('users')
                ->whereNull('deleted_at')
                ->where('created_at', '<=', $snapshotDate->toDateTimeString())
                ->count();
            $employeeCount = max(1, $employeeCount);

            $annualExpenses = 80000 + ($employeeCount * 60000);
            $annualExpenses += rand(-3000, 5000); // slight noise

            $monthlyRevenue = DB::table('invoices')
                ->whereYear('created_at', $current->year)
                ->whereMonth('created_at', $current->month)
                ->sum('net');
            $monthlyRevenue = (float)$monthlyRevenue;

            $monthlyExpenses = $annualExpenses / 12;
            $bankBalance += $monthlyRevenue - $monthlyExpenses;
            $bankBalance = max(5000, $bankBalance + rand(-2000, 2000)); // floor + noise

            $hourlyWage = 90 + ($monthsElapsed / 12) * 3;
            $hourlyWage = round($hourlyWage + rand(-1, 2), 2);

            $deg12m = DB::table('invoices')
                ->where('created_at', '>=', $current->copy()->subYear()->toDateTimeString())
                ->where('created_at', '<=', $snapshotDate->toDateTimeString())
                ->sum('net');

            $this->insertFloatParamHistory($expensesParam->id, $annualExpenses, $snapshotDate);
            $this->insertFloatParamHistory($bankParam->id, round($bankBalance, 2), $snapshotDate);
            $this->insertFloatParamHistory($hrWageParam->id, $hourlyWage, $snapshotDate);
            $this->insertFloatParamHistory($hrHpdParam->id, 7.8, $snapshotDate);
            $this->insertFloatParamHistory($hrWorkdaysParam->id, $this->workdaysInMonth($current), $snapshotDate);
            $this->insertFloatParamHistory($invoicesDegParam->id, round((float)$deg12m, 2), $snapshotDate);

            $current->addMonth();
            $monthsElapsed++;
        }
    }
    private function insertFloatParamHistory(int $paramId, float $value, Carbon $date): void {
        DB::table('float_params')->insert([
            'param_id'   => $paramId,
            'value'      => $value,
            'created_at' => $date->toDateTimeString(),
            'updated_at' => $date->toDateTimeString(),
        ]);
    }
    private function workdaysInMonth(Carbon $month): int {
        $days    = 0;
        $current = $month->copy()->startOfMonth();
        $end     = $month->copy()->endOfMonth();
        while ($current->lte($end)) {
            if (! $current->isWeekend()) {
                $days++;
            }
            $current->addDay();
        }
        return $days;
    }

    // -------------------------------------------------------------------------
    // Factory helpers
    // -------------------------------------------------------------------------

    public function createNewAssignment(Carbon $date, Project $project, User $user): void {
        $hours      = ($project->target_wage / 20000) * 21 * 8;
        $assignment = [
            'created_at'    => $date,
            'updated_at'    => $date,
            'assignee_id'   => $user->id,
            'project_id'    => $project->id,
            'role_id'       => 2,
            'hours_planned' => $hours,
            'hours_weekly'  => 40,
            ...$project->toPoly(),
            ...$user->toPoly('assignee'),
        ];

        $request    = Request::create('/', 'POST', $assignment);
        $assignment = new Assignment;
        $assignment->applyAndSave($request);
    }
    public function createNewCustomer(Carbon $date): array {
        $customer = $this->demoSeederData()->new_customer();

        $customer['company']['created_at']         = $date;
        $customer['company']['updated_at']         = $date;
        $customer['contact']['created_at']         = $date;
        $customer['contact']['updated_at']         = $date;
        $customer['company_contact']['created_at'] = $date;
        $customer['company_contact']['updated_at'] = $date;

        $request = Request::create('/', 'POST', $customer['company']);
        $company = new Company;
        $company->applyAndSave($request);

        $request = Request::create('/', 'POST', $customer['contact']);
        $contact = new Contact;
        $contact->applyAndSave($request);

        $customer['company_contact']['company_id'] = $company->id;
        $customer['company_contact']['contact_id'] = $contact->id;
        $request                                   = Request::create('/', 'POST', $customer['company_contact']);
        $companyContact                            = new CompanyContact;
        $companyContact->applyAndSave($request);

        $project = $this->createNewProject($company);
        return [
            'company'         => $company,
            'contact'         => $contact,
            'company_contact' => $companyContact,
            'project'         => $project,
        ];
    }
    public function createNewProject(Company $company): Project {
        [$project, $invoiceItems] = $this->demoSeederData()->new_project($company);
        $request                  = Request::create('/', 'POST', $project);
        $project                  = new Project;
        $project->applyAndSave($request);

        foreach ($invoiceItems as $invoiceItem) {
            $invoiceItem['company_id'] = $company->id;
            $invoiceItem['project_id'] = $project->id;
            $request                   = Request::create('/', 'POST', $invoiceItem);
            (new InvoiceItem)->applyAndSave($request);
        }
        return $project;
    }
    public function createNewFocus(Project $project, User $user, Carbon $start, float $duration): void {
        $focus = [
            'created_at' => $start,
            'updated_at' => $start,
            'started_at' => $start,
            'duration'   => $duration,
            'user_id'    => $user->id,
            ...$project->toPoly(),
        ];
        $request = Request::create('/', 'POST', $focus);
        (new Focus)->applyAndSave($request);
    }
}
