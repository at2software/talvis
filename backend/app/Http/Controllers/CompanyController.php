<?php

namespace App\Http\Controllers;

use App\Enums\InvoiceItemType;
use App\Helpers\NLog;
use App\Http\Controllers\Traits\HasFociController;
use App\Http\Requests\Company\StoreConnectionRequest;
use App\Models\Company;
use App\Models\Connection;
use App\Models\Param;
use App\Services\FocusStatisticsService;
use App\Traits\HasParams;
use Illuminate\Console\Command;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;

class CompanyController extends Controller {
    use HasFociController;

    public function indexWithCoordinates(Request $request) {
        $myCompany = Param::get('ME_ID')->value;

        $companies = Company::select('id', 'vcard', 'net')
            ->whereNot('id', $myCompany)
            ->where('vcard', 'REGEXP', '(^|\n)GEO:')
            ->get()
            ->map(function ($company) {
                $geoData = $company->vcard->getFirstAttr('GEO');
                if ($geoData && count($geoData) >= 2 && ! empty($geoData[0]) && ! empty($geoData[1])) {
                    $lat = floatval($geoData[0]);
                    $lng = floatval($geoData[1]);

                    if (is_numeric($geoData[0]) && is_numeric($geoData[1]) && $lat != 0 && $lng != 0) {
                        
                        $net      = floatval($company->net ?? 0);
                        $pinSize  = 'small';
                        $pinColor = 'grey';

                        if ($net < 1000) {
                            $pinSize  = 'small';
                            $pinColor = 'grey';
                        } elseif ($net < 10000) {
                            $pinSize  = 'small';
                            $pinColor = 'red';
                        } elseif ($net < 100000) {
                            $pinSize  = 'medium';
                            $pinColor = 'orange';
                        } elseif ($net < 1000000) {
                            $pinSize  = 'large';
                            $pinColor = 'yellow';
                        } else {
                            $pinSize  = 'large';
                            $pinColor = 'green';
                        }
                        return [
                            'id'       => $company->id,
                            'name'     => $company->name, // This uses the getNameAttribute() from VcardTrait
                            'lat'      => $lat,
                            'lng'      => $lng,
                            'path'     => $company->path,
                            'pinSize'  => $pinSize,
                            'pinColor' => $pinColor,
                        ];
                    }
                }
                return null;
            })
            ->filter();
        return response()->json($companies->values());
    }
    public function indexFoci(Request $request, Company $_) {
        return $this->_indexFoci($request, $_);
    }
    public function index(Request $request) {
        $myCompany = Param::get('ME_ID')->value;
        $query     = Company::select()->whereNot('id', $myCompany)->whereNotDraft();
        $user      = Auth::user();

        if ($request->onlyWithActiveProjects == 'true') {
            $query->whereHas('projectsUnfinished');
        }

        if ($request->revenueOn == 'true') {
            $query->having('revenue', '>', $request->revenueMin);
        }

        if ($request->has('created_from')) {
            $query->where('created_at', '>=', $request->created_from);
        }
        if ($request->has('created_to')) {
            $query->where('created_at', '<=', $request->created_to);
        }

        if ($request->has('updated_from')) {
            $query->where('updated_at', '>=', $request->updated_from);
        }
        if ($request->has('updated_to')) {
            $query->where('updated_at', '<=', $request->updated_to);
        }

        if ($request->has('revenue_min') && is_numeric($request->revenue_min)) {
            $query->where('net', '>=', floatval($request->revenue_min));
        }

        if ($request->has('product_id') && is_numeric($request->product_id)) {
            $query->whereHas('invoices', function ($invoiceQuery) use ($request) {
                $invoiceQuery->whereHas('invoiceItems', function ($itemQuery) use ($request) {
                    $itemQuery->where('product_source_id', $request->product_id);
                });
            });
        }

        $sortBy        = $request->get('sort_by', 'created_at');
        $sortDirection = $request->get('sort_direction', 'desc');

        $allowedSortColumns = ['created_at', 'updated_at', 'customer_number', 'net'];
        if (in_array($sortBy, $allowedSortColumns)) {
            $query->orderBy($sortBy, $sortDirection === 'asc' ? 'asc' : 'desc');
        } else {
            $query->latest(); // Default fallback
        }

        $query->withCount(['projectsUnfinished as running_project_count']);

        if ($user->hasAnyRole(['admin', 'financial'])) {
            $query->withCount(['invoicesUnpaid as unpaid_invoice_count'])
                ->withSum('invoicesUnpaid as unpaid_invoice_value', 'gross');
        }

        $query->with(['projectsUnfinished' => function ($q) {
            $q->withSum('foci as hours_invested', 'duration');
        }]);

        $replies = $query->paginate(100);
        $replies->withQueryString();
        $replies->appends($request->input())->links();

        $companyHidden = ['customer_number', 'vat_id', 'managing_director', 'commercial_register', 'invoice_correction', 'invoice_email', 'address', 'discount', 'has_direct_debit', 'requires_po', 'has_nda', 'remarketing_interval', 'flags', 'total_time', 'net_remaining', 'contact_id'];
        $projectHidden = ['company', 'params', 'hours_invested', 'intro', 'outro', 'description', 'work_estimated', 'target_wage', 'support_net', 'net_remaining', 'gross', 'lead_probability', 'is_ignored_from_prepared', 'decision_at', 'vcard'];

        $replies->each(function (&$r) use ($companyHidden, $projectHidden) {
            $r->append('running_project_value');
            $r->makeHidden($companyHidden);
            $r->projectsUnfinished->each(fn ($p) => $p->makeHidden($projectHidden));
        });
        return $replies;
    }
    public function showByPhone(Request $request): ?JsonResponse {
        $phoneNumber = $request->input('phone_number');
        $company     = Company::searchByPhone($phoneNumber);
        if (empty($company)) {
            return null;
        }
        $user = Auth::user();
        $company->employees;
        $company->employees->each(fn ($_) => $_->contact);
        $company->assignees;
        $company->assignees->each(fn ($_) => $_->assignee);
        $company->append('address', 'last_invoice_at', 'avg_payment_delay_days');
        if ($user->hasAnyRole(['admin', 'financial'])) {
            $company->append('params');
        }
        return response()->json($company);
    }
    public function indexUnbilledFoci() {
        $widgetController = new WidgetController;
        return $widgetController->GET_CASHFLOW_CUSTOMER_SUPPORT()->getAndAppend();
    }
    private function companiesWithChurnPredictions() {
        $myCompany     = Param::get('ME_ID')->value;
        $churnParamIds = Param::whereIn('key', ['ML_PREDICTED_INTERVAL_DAYS', 'ML_CHURN_PROBABILITY_12M'])->pluck('id');

        return Company::whereActive()
            ->whereNot('id', $myCompany)
            ->whereHas('floatParams', fn ($q) => $q->whereIn('param_id', $churnParamIds))
            ->whereHas('invoices', fn ($q) => $q->where('created_at', '>=', now()->subYears(2)))
            ->with(['latestInvoice', ...HasParams::$WITH])
            ->get();
    }
    public function indexOverdueForContact() {
        $companies = $this->companiesWithChurnPredictions()
            ->filter(fn (Company $company) => $company->ml_overdue_for_contact || ($company->ml_churn_probability_12m ?? 0) >= 0.5)
            ->map(fn (Company $company) => [
                'id'                            => $company->id,
                'name'                          => $company->name,
                'path'                          => $company->path,
                'ml_predicted_interval_days'    => $company->ml_predicted_interval_days,
                'ml_predicted_next_purchase_at' => $company->ml_predicted_next_purchase_at?->toDateString(),
                'ml_overdue_for_contact'        => $company->ml_overdue_for_contact,
                'ml_churn_probability_12m'      => $company->ml_churn_probability_12m,
                'ml_predicted_revenue_12m'      => $company->ml_predicted_revenue_12m,
                'last_invoice_at'               => $company->latestInvoice?->created_at?->toDateString(),
            ])
            ->sortByDesc('ml_churn_probability_12m')
            ->values();

        return response()->json($companies);
    }
    public function indexByChurnRisk() {
        return $this->companiesWithChurnPredictions()
            ->filter(fn (Company $company) => $company->ml_churn_probability_12m !== null)
            ->each(fn (Company $company) => $company->append(['ml_churn_probability_12m', 'ml_predicted_next_purchase_date', 'ml_overdue_for_contact']))
            ->sortByDesc('ml_churn_probability_12m')
            ->values();
    }
    public function indexAssignees(Company $_) {
        return $_->assignees()->latest('role_id')->get()->load('parent');
    }
    public function indexComments(Company $_) {
        return $_->comments;
    }
    public function indexConnections(Company $_) {
        $connections1 = Connection::where('company1_id', $_->id)
            ->with(['company1', 'company2'])
            ->withCount('projects')
            ->get();

        $connections2 = Connection::where('company2_id', $_->id)
            ->with(['company1', 'company2'])
            ->withCount('projects')
            ->get();
        return Connection::obfuscateNet($connections1->merge($connections2));
    }
    public function indexAllConnections() {
        return Connection::obfuscateNet(
            Connection::with(['company1', 'company2'])->withCount('projects')->get()
        );
    }
    public function indexEmployees(Company $_) {
        return $_->employees;
    }
    public function indexInvoiceItems(Request $request, Company $_) {
        $query = $_->indexedItems()->whereNull('invoice_id');

        if ($request->boolean('support_only')) {
            $query->whereNull('project_id');
        }
        return $query->get();
    }
    public function showPredictionAccuracy(Company $_) {
        return response()->json(FocusStatisticsService::getCompanyMonthlyPredictionAccuracy($_));
    }
    public function show(Company $company) {
        $company->appendRequest();
        $company->withRequest();
        $company->load([
            'assignees',
            'assignees.assignee',
            'baseProjects',
            'employees',
            'employees.contact',
            'employees.contact.companyContacts' => fn ($q) => $q->whereHas('company')->with('company'),
            'latestInvoice',
            'source',
            'files',
            ...HasParams::$WITH,
        ]);

        $connections = Connection::where('company1_id', $company->id)
            ->orWhere('company2_id', $company->id)
            ->with(['company1', 'company2'])
            ->get();

        $availableConnections = $connections->map(function ($connection) use ($company) {
            return [
                'connection_id' => $connection->id,
                'other_company' => $connection->getOtherCompany($company->id),
            ];
        });

        $company->setAttribute('available_connections', $availableConnections);
        $company->baseProjects->each(fn ($_) => $_->append('hours_invested', 'work_estimated'));
        $company->append('address', 'desicion_duration', 'timeline_chart', 'last_invoice_at', 'avg_payment_delay_days');
        if (Auth::user()->hasAnyRole(['admin', 'financial'])) {
            $company->append('params', 'billing_considerations');
            $company->upcomingRepeatingInvoiceItems;
        }
        return $company->toJson();
    }
    public function store(Request $request) {
        $data = $this->getBody();
        if (preg_match("/^https?:\/\//is", $data->name)) {
            $vcard = Company::scrapeWebpage($data->name);
        } else {
            $vcard = 'FN:'.$data->name.PHP_EOL;
            $vcard .= 'ORG:'.$data->name.PHP_EOL;
            $vcard .= 'ADR;type=work:;;;;;;DE'.PHP_EOL;
            $vcard .= 'URL;type=work:https://'.PHP_EOL;
        }
        $new        = new Company;
        $new->vcard = $vcard;
        $new->save();
        while (Artisan::call('customers:fixMissingNumbers') != Command::SUCCESS) {
        } // Add missing customer numbers
        return $new;
    }
    public function storeDraft(Request $request) {
        $phone  = preg_replace('/\D/', '', (string)$request->input('phone_number', ''));
        $company = Company::draftByPhone($phone);
        if (! $company) {
            $vcard  = "FN:\n";
            $vcard .= "ORG:\n";
            $vcard .= "URL;type=work:\n";
            $vcard .= "X-KNOWNSEQ-DRAFT:".$phone."\n";
            $company        = new Company;
            $company->vcard = $vcard;
            $company->flags = Company::FLAG_DRAFT;
            $company->save();
            $employee        = $company->createEmployee();
            $employee->vcard = "EMAIL:\nTEL;type=voice,work:\nTEL;type=cell,work:".$phone."\n";
            $employee->save();
        }
        $company->load('employees.contact');
        $company->append('address');
        return response()->json($company);
    }

    public function keep(Company $_) {
        $_->flags = (int)$_->flags & ~Company::FLAG_DRAFT;
        $_->vcard = preg_replace('/^X-KNOWNSEQ-DRAFT:.*\R?/m', '', (string)$_->vcard);
        $_->save();
        while (Artisan::call('customers:fixMissingNumbers') != Command::SUCCESS) {
        }
        return response()->json($_->fresh());
    }

    public function discardDraft(Company $_) {
        if (! $_->isDraft()) {
            return response()->make('not a draft', 403);
        }
        $_->purgeDraft();
        return response()->make('success', 202);
    }

    public function storeProject(Request $request, Company $_) {
        return $_->createProject(
            $request->input('name', 'New project'),
            $request->input('project_id'),
            $request->user()->id
        );
    }
    public function storeAssignee(Request $request, Company $_) {
        return $_->addAssigneeFromRequest($request);
    }
    public function storeEmployee(Company $_) {
        return $_->createEmployee();
    }
    public function storeConnection(StoreConnectionRequest $request) {
        $q  = ['company1_id' => $request->validated('company1_id'), 'company2_id' => $request->validated('company2_id')];
        $q2 = ['company1_id' => $request->validated('company2_id'), 'company2_id' => $request->validated('company1_id')];
        if (Connection::where($q)->exists()) {
            return response('connection already exists', 405);
        }
        if (Connection::where($q2)->exists()) {
            return response('connection already exists', 405);
        }
        if (request('company1_id') == request('company2_id')) {
            return response('cannot connect to itself', 405);
        }
        $con = Connection::create($q);
        $con->company1;
        $con->company2;
        return $con;
    }
    public function importImprint(Request $request, Company $_) {
        NLog::info('ImportImprint: Starting imprint import for company', ['company_id' => $_->id, 'company_name' => $_->name]);

        if ($url = $_->vcard->getFirstValue('URL')) {
            NLog::info('ImportImprint: Found URL in company vcard', ['url' => $url]);

            try {
                \Artisan::call('app:analyzeUrlImprint', [
                    'url'              => $url,
                    '--existing-vcard' => $_->vcard,
                ]);
                $scrapedData = json_decode(\Artisan::output());

                $_->vcard = Company::scrapeWebpage($url, $_);

                if (! empty($scrapedData->BUSINESS_REGISTER)) {
                    if (empty($_->commercial_register)) {
                        $_->commercial_register = $scrapedData->BUSINESS_REGISTER;
                        NLog::info('ImportImprint: Set commercial register', ['register' => $scrapedData->BUSINESS_REGISTER]);
                    } else {
                        NLog::info('ImportImprint: Commercial register already exists, keeping existing value', [
                            'existing' => $_->commercial_register,
                            'scraped'  => $scrapedData->BUSINESS_REGISTER,
                        ]);
                    }
                }

                $_->save();
                NLog::info('ImportImprint: Successfully scraped and saved imprint data');
            } catch (\Exception $e) {
                NLog::error('ImportImprint: Error scraping webpage', ['error' => $e->getMessage(), 'url' => $url]);
                throw $e;
            }
        } else {
            NLog::warning('ImportImprint: No URL found in company vcard', ['company_id' => $_->id]);
        }
        return $_;
    }
    public function update(Request $request, int $id) {
        return Company::findOrFail($id)->applyAndSave($request);
    }
    public function destroy(Request $request, Company $company) {
        $company->delete();
        return response()->make('success', 202);
    }
    public function makeInvoice(Company $_) {
        return $_->makeInvoiceFor();
    }
    public function updateActivateRepeatingItems(Company $_) {
        $updated = $_->invoiceItems()
            ->whereIn('type', InvoiceItemType::Repeating)
            ->whereNull('next_recurrence_at')
            ->update(['next_recurrence_at' => now()]);

        Artisan::call('cron:standing-orders');
        return response()->json(['activated_count' => $updated]);
    }
    public function maintenanceCommercialRegister() {
        return Company::whereActive()->whereCorporation()->whereMissingCommercialRegister()->get();
    }
}
