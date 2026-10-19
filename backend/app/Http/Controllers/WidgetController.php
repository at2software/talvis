<?php

namespace App\Http\Controllers;

use App\Enums\InvoiceItemType;
use App\Models\CashflowBuilder;
use App\Models\Comment;
use App\Models\Company;
use App\Models\CompanyContact;
use App\Models\Focus;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Project;
use App\Models\ProjectState;
use App\Models\User;
use App\Models\UserEmployment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class WidgetController extends Controller {
    public function preparedInvoices() {
        $maxUpdatedAt = $this->maxUpdatedFor(Company::class, Project::class);

        $companies = Company::getAllWithSupportItems();

        $projects = Project::getAllWithSupportItems();

        $finishedProjects = Project::whereFinishedSuccessfull()
            ->where('is_ignored_from_prepared', false)
            ->whereHas('unbilledInvoiceItems')
            ->withSum('unbilledInvoiceItems as net_remaining', 'net')
            ->with(['unbilledInvoiceItems' => function ($q) {
                $q->select('id', 'company_id', 'project_id', 'created_at', 'net', 'type')
                    ->orderBy('created_at', 'asc')
                    ->limit(1);
            }])
            ->get();
        $companies->each->makeHidden('support_items');
        $projects->each->makeHidden(['params', 'support_items', 'company']);
        $finishedProjects->each->makeHidden(['params', 'unbilled_invoice_items', 'company']);
        return collect()
            ->merge($companies)
            ->merge($projects)
            ->merge($finishedProjects);
    }
    public function unpaidInvoices() {
        return $this->GET_CASHFLOW_INVOICES()->getAndAppend();
    }
    public function cashflowWidget(string $key, Request $request) {
        $methodName = 'GET_CASHFLOW_'.$key;

        if (! method_exists($this, $methodName)) {
            return response()->json(['error' => 'Unknown cashflow key'], 404);
        }

        $baseWage        = Param::get('HR_HOURLY_WAGE')->value;
        $cashflowBuilder = $this->$methodName($baseWage);

        $objects = $cashflowBuilder->getAndAppend();

        $objects->each->makeHidden('params');

        $this->addAgeBadges($key, $objects);

        $responseData = ['objects' => $objects];

        if ($request->boolean('withChart') && $request->user()->hasAnyRole(['admin', 'financial'])) {
            $param = Param::where('key', 'CASHFLOW_'.$key)->first();
            if ($param) {
                $request->merge([
                    'cluster' => $request->input('cluster', 'month'),
                    'since'   => $request->input('since', now()->subMonths(36)->timestamp),
                ]);
                $historyData = $param->historyResponse();
                if ($historyData instanceof JsonResponse) {
                    $responseData['history'] = [$historyData->getData(true)];
                } else {
                    $responseData['history'] = [$historyData];
                }
            }
        }

        return $responseData;
    }
    private function addAgeBadges(string $key, $objects) {
        if ($objects->isEmpty()) {
            return;
        }

        $now = Carbon::now();

        match ($key) {
            'PROJECTS_TIMEBASED', 'CUSTOMER_SUPPORT' => $this->addFociBadges($objects, $now, $key),
            'INVOICES_PREPARED'                      => $this->addInvoiceBadges($objects, $now),
            default                                  => null
        };
    }
    private function addFociBadges($objects, $now, $key) {
        $ids        = $objects->pluck('id');
        $parentType = $key === 'PROJECTS_TIMEBASED' ? 'App\\Models\\Project' : 'App\\Models\\Company';
        $label      = $key === 'PROJECTS_TIMEBASED' ? 'time-based' : 'support';

        $oldestFoci = Focus::whereIn('parent_id', $ids)
            ->where('parent_type', $parentType)
            ->whereNull('invoiced_in_item_id')
            ->where('is_unpaid', false)
            ->whereNotNull('started_at')
            ->select('parent_id', DB::raw('MIN(started_at) as oldest_started_at'))
            ->groupBy('parent_id');
        $oldestFoci = $oldestFoci->get()
            ->keyBy('parent_id');

        $objects->each(function ($object) use ($oldestFoci, $now, $label) {
            if ($oldestDate = $oldestFoci->get($object->id)?->oldest_started_at) {
                $days = (int)Carbon::parse($oldestDate)->diffInDays($now);
                if ($days > 60) {
                    $object->badge = ['bg-danger', "{$label}: oldest unbilled {$days}d"];
                }
            }
        });
    }
    private function addInvoiceBadges($objects, $now) {
        $objects->each(function ($item) use ($now) {
            $oldestInvoiceItem = null;

            if ($item->relationLoaded('supportItems') && $item->supportItems->isNotEmpty()) {
                $oldestInvoiceItem = $item->supportItems->first();
            } elseif ($item->relationLoaded('unbilledInvoiceItems') && $item->unbilledInvoiceItems->isNotEmpty()) {
                $oldestInvoiceItem = $item->unbilledInvoiceItems->first();
            } elseif (method_exists($item, 'supportItems')) {
                $oldestInvoiceItem = $item->supportItems()->orderBy('created_at', 'asc')->first();
            } elseif (method_exists($item, 'unbilledInvoiceItems')) {
                $oldestInvoiceItem = $item->unbilledInvoiceItems()->orderBy('created_at', 'asc')->first();
            }

            if ($oldestInvoiceItem) {
                $days = (int)$oldestInvoiceItem->created_at->diffInDays($now);
                if ($days > 30) {
                    $item->badge = ['bg-danger', "prepared invoice: oldest {$days}d"];
                }
            }
        });
    }
    public function GET_CASHFLOW_CUSTOMER_SUPPORT($baseWage = 0) {
        return new CashflowBuilder(
            builder: Company::whereHasUnbilledFoci()->whereNot('id', Param::get('ME_ID')->value),
            appends: ['ml_predicted_support_hours'],
            sum: fn ($company) => $company->foci_unbilled_sum_duration * $company->getWage($baseWage)
        );
    }
    public function GET_CASHFLOW_INVOICES() {
        return new CashflowBuilder(
            builder: Invoice::where('paid_at', null)
                ->with('company')
                ->withSum([
                    'invoiceItems as gross_remaining_calculated' => function ($query) {
                        $query->whereIn('type', InvoiceItemType::TotalRemaining);
                    },
                ], 'gross'),
            sum: fn ($invoice) => $invoice->gross_remaining_calculated ?? 0
        );
    }
    public function GET_CASHFLOW_INVOICES_RECURRING() {
        return new CashflowBuilder(
            builder: InvoiceItem::whereIn('type', InvoiceItemType::Repeating)->with(['company', 'project']),
            sum: function ($item) {
                return match ($item->type) {
                    InvoiceItemType::Daily     => $item->net * 365,
                    InvoiceItemType::Weekly    => $item->net * 52,
                    InvoiceItemType::Monthly   => $item->net * 12,
                    InvoiceItemType::Quarterly => $item->net * 4,
                    InvoiceItemType::Yearly    => $item->net,
                    default                    => 0
                };
            }
        );
    }
    public function GET_CASHFLOW_PROJECTS_ACQUISITIONS() {
        $builder = Project::wherePrepared()
            ->whereNot('is_internal', true)
            ->with(['latestState', 'company']);

        if (request('only-mine') === 'true') {
            $builder->whereHas('myAssignment');
        }
        if (request('only-mine-as-pm') === 'true') {
            $builder->where('project_manager_id', request()->user()->id);
        }
        return new CashflowBuilder(
            builder: $builder,
            sum: fn ($project) => $project->net * $project->lead_probability * $project->lead_probability_multiplier,
        );
    }
    public function GET_CASHFLOW_PROJECTS_TIMEBASED($baseWage = 0) {
        $builder = Project::wherePreparedOrRunning()
            ->whereNot('is_internal', true)
            ->where('is_time_based', true)
            ->withSum('foci_unbilled', 'duration')
            ->with(['latestState', 'company']);

        if (request('only-mine') === 'true') {
            $builder->whereHas('myAssignment');
        }
        if (request('only-mine-as-pm') === 'true') {
            $builder->where('project_manager_id', request()->user()->id);
        }
        return new CashflowBuilder(
            builder: $builder,
            appends: ['uninvoiced_hours'],
            sum: fn ($project) => ($project->foci_unbilled_sum_duration ?? 0) * $project->getWage($baseWage)
        );
    }
    public function GET_CASHFLOW_PROJECTS() {
        $builder = Project::wherePreparedOrRunning()
            ->whereNot('is_internal', true)
            ->where('is_time_based', false)
            ->whereHas('latestState', fn ($q) => $q->where('progress', '!=', ProjectState::Prepared))
            ->with(['latestState', 'company', 'hoursInvestedSum']);

        if (request('only-mine') === 'true') {
            $builder->whereHas('myAssignment');
        }
        if (request('only-mine-as-pm') === 'true') {
            $builder->where('project_manager_id', request()->user()->id);
        }
        return new CashflowBuilder(
            builder: $builder,
            appends: ['progress', 'work_estimated', 'hours_invested'],
            sum: fn ($project) => $project->net_remaining
        );
    }
    public function indexTimeBasedEmployees() {
        $users = UserEmployment::where('is_active', true)
            ->where('is_time_based', true)
            ->with('user')
            ->get()
            ->map(fn ($_) => $_->user);
        $users->each(fn ($_) => $_->getTimeBasedEmploymentInfo());
        return $users->map->only(['id', 'name', 'duration', 'path']);
    }
    public function indexNewItems() {
        $lastWeek = now()->subDays(7);
        $data     = Comment::whereAfter($lastWeek)->with('parent', 'user')->latest()->get()->each(fn (&$_) => $_->user?->only(['id', 'name']) ?? null);
        $data     = $data->merge(Company::whereAfter($lastWeek)->get());
        $data     = $data->merge(Project::whereAfter($lastWeek)->with('company')->get());
        if (request()->user()->hasAnyRole(['admin', 'invoicing'])) {
            $data = $data->merge(Invoice::whereAfter($lastWeek)->with('company')->get());
        }
        $data = $data->sortByDesc('created_at');
        return $data->values();
    }
    public function indexJubilees() {
        $collection            = [];
        $now                   = now()->startOfDay();
        $upcomingDateBirthdays = $now->copy()->addDays(30);
        $upcomingDateJubilees  = $now->copy()->addDays(180);

        foreach (User::where('vcard', 'like', '%BDAY%')->whereHas('activeEmployments')->get() as $_) {
            $bday           = $this->parseBirthday($_->vcard->getFirstValue('BDAY'));
            $nextOccurrence = $bday ? $this->getNextOccurence($bday, $now) : null;
            if (! $nextOccurrence || $nextOccurrence > $upcomingDateBirthdays) {
                continue;
            }
            $collection[] = [
                'type'  => 0,
                'next'  => $nextOccurrence->format('Y-m-d'),
                'path'  => $_->path,
                'name'  => $_->name,
                'label' => round($bday->diffInYears($now, true)).'. Geburtstag',
            ];
        }

        $companyContacts = CompanyContact::whereNot('is_retired')->whereHas('company')->whereHas('contact', fn ($q) => $q->where('vcard', 'like', '%BDAY%'))->with('contact', 'company')->get();
        foreach ($companyContacts->unique('contact_id') as $_) {
            $bday           = $this->parseBirthday($_->contact->vcard->getFirstValue('BDAY'));
            $nextOccurrence = $bday ? $this->getNextOccurence($bday, $now) : null;
            if (! $nextOccurrence || $nextOccurrence > $upcomingDateBirthdays) {
                continue;
            }
            $collection[] = [
                'type'  => 0,
                'next'  => $nextOccurrence->format('Y-m-d'),
                'path'  => $_->company->path,
                'name'  => $_->contact->name,
                'label' => round($bday->diffInYears($now, true)).'. Geburtstag',
            ];
        }

        foreach (User::whereHas('activeEmployments')->withMin('employments', 'started_at')->get() as $_) {
            if (! $_->employments_min_started_at) {
                continue;
            }
            $startDate      = Carbon::parse($_->employments_min_started_at)->startOfDay();
            $nextOccurrence = $this->getNextOccurence($startDate, $now);
            if (! $nextOccurrence || $nextOccurrence > $upcomingDateBirthdays) {
                continue;
            }
            $yearsEmployed = $nextOccurrence->year - $startDate->year;
            if ($yearsEmployed < 1) {
                continue;
            }
            $collection[] = [
                'type'  => 2,
                'next'  => $nextOccurrence->format('Y-m-d'),
                'path'  => $_->path,
                'name'  => $_->name,
                'label' => "$yearsEmployed. Arbeitsjubiläum",
            ];
        }

        $companies = Company::whereAfter(now()->subYears(2), 'updated_at')
            ->whereHas('invoices', fn ($q) => $q->where('created_at', '>', now()->subYears(2)))
            ->get();
        foreach ($companies as $_) {
            if (! $_->created_at) {
                continue;
            }
            $yearsSinceRegistered = round($_->created_at->diffInYears(now()));
            if ($yearsSinceRegistered % 5 !== 0) {
                continue;
            }
            $jubileeOccurence = $this->getNextOccurence($_->created_at, $now);
            if ($jubileeOccurence > $upcomingDateJubilees) {
                continue;
            }
            $name         = "$_->name";
            $collection[] = [
                'type'  => 1,
                'next'  => $jubileeOccurence->format('Y-m-d'),
                'path'  => $_->path,
                'name'  => $name,
                'label' => "$yearsSinceRegistered Jubiläum",
            ];
        }
        return $collection;
    }
    private function parseBirthday(?string $value): ?Carbon {
        if (! $value) {
            return null;
        }
        return rescue(fn () => Carbon::parse($value)->startOfDay(), null, false);
    }
    private function getNextOccurence($carbonDate, $now) {
        $next = Carbon::create($now->year, $carbonDate->month, $carbonDate->day);
        if ($next < $now) {
            $next->addYear();
        }
        return $next->startOfDay();
    }
    public function GET_CASHFLOW_INVOICES_PREPARED() {
        return new class {
            public function getAndAppend() {
                $companies = Company::getAllWithSupportItems();

                $projects = Project::getAllWithSupportItems()->load('company');

                $finishedProjects = Project::whereFinishedSuccessfull()
                    ->where('is_ignored_from_prepared', false)
                    ->whereHas('unbilledInvoiceItems')
                    ->withSum('unbilledInvoiceItems as net_remaining', 'net')
                    ->with(['company', 'unbilledInvoiceItems' => function ($q) {
                        $q->select('id', 'company_id', 'project_id', 'created_at', 'net', 'type')
                            ->orderBy('created_at', 'asc')
                            ->limit(1);
                    }])
                    ->get();
                return collect()
                    ->merge($companies)
                    ->merge($projects)
                    ->merge($finishedProjects)
                    ->each(fn ($model) => $model->cashflow_value = (float)($model->net_remaining ?? 0));
            }
        };
    }
}
