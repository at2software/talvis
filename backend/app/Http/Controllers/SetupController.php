<?php

namespace App\Http\Controllers;

use App\Http\Requests\Setup\StoreOwnerRequest;
use App\Http\Requests\Setup\UpdateCompanyRequest;
use App\Http\Requests\Setup\UpdateInvoicingRequest;
use App\Http\Requests\Setup\UpdateWorkingTimeRequest;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Param;
use App\Models\Product;
use App\Models\Project;
use App\Models\User;
use App\Models\UserEmployment;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SetupController extends Controller {
    private const INVOICING_PARAMS          = ['INVOICE_DEFAULT_VAT', 'INVOICE_PAYMENT_DURATION', 'INVOICE_HOURLY_WAGE', 'INVOICE_NO_PREFIX', 'INVOICE_NO_DIGITS', 'INVOICE_NO_CURRENT', 'QUOTE_NO_PREFIX', 'QUOTE_NO_DIGITS', 'QUOTE_NO_CURRENT'];
    private const INVOICING_REQUIRED_PARAMS = ['INVOICE_DEFAULT_VAT', 'INVOICE_PAYMENT_DURATION', 'INVOICE_NO_PREFIX', 'INVOICE_NO_DIGITS', 'INVOICE_NO_CURRENT'];
    private const DEFAULT_VACATION_DAYS     = 30;
    private const OWNER_EMPLOYMENT          = ['type' => 'Inhaber', 'hpw' => 40];

    public function showStatus() {
        $user = Auth::user();
        $meId = Param::get('ME_ID')->value;

        return [
            $this->item('owner', true, [
                'own_admin'         => User::role('admin')->where('email', '!=', config('services.admin.email'))->exists(),
                'seed_admin_active' => User::isSeedAdminRetired() || ! User::seedAdmin()?->hasRole('admin'),
            ]),
            $this->item('company', true, array_fill_keys(Company::senderReadiness(), false)),
            $this->item('invoicing', true, array_combine(self::INVOICING_REQUIRED_PARAMS, array_map(fn ($_) => Param::isStored($_), self::INVOICING_REQUIRED_PARAMS))),
            $this->item('working_time', true, [
                'employment' => (bool)$user->activeEmployment,
                'work_zip'   => trim((string)$user->work_zip) !== '',
            ]),
            $this->item('vacation', true, ['vacation_grant' => $user->hasValidVacationGrant()]),
            $this->item('products', false, ['product' => Product::exists()]),
            $this->item('first_customer', false, ['customer' => Company::when($meId, fn ($_) => $_->whereKeyNot($meId))->exists()]),
            $this->item('first_project', false, ['project' => Project::exists()]),
            $this->item('first_invoice', false, ['invoice' => Invoice::exists()]),
        ];
    }
    public function storeOwner(StoreOwnerRequest $request) {
        $seedAdmin = Auth::user();
        if (! $seedAdmin->isSeedAdmin()) {
            abort(403, 'Only the default account can hand over to an own account.');
        }
        $owner = DB::transaction(function () use ($request, $seedAdmin) {
            $owner = User::register([...$request->validated(), 'employment' => self::OWNER_EMPLOYMENT]);
            $owner->assignRole('admin');
            $owner->ensureDefaultDashboard();
            $seedAdmin->retireSeedAdmin();
            return $owner;
        });
        return [...$owner->jsonSerialize(), 'api_token' => $owner->issueSessionToken()];
    }
    public function showCompany() {
        return [...Company::senderData(), 'legal_form' => ''];
    }
    public function updateCompany(UpdateCompanyRequest $request) {
        DB::transaction(fn () => Company::updateMe($request->validated()));
        return $this->showCompany();
    }
    public function showInvoicing() {
        return array_combine(self::INVOICING_PARAMS, array_map(fn ($_) => Param::get($_)->value, self::INVOICING_PARAMS));
    }
    public function updateInvoicing(UpdateInvoicingRequest $request) {
        $validated = $request->validated();
        DB::transaction(function () use ($validated) {
            foreach (self::INVOICING_PARAMS as $key) {
                if (array_key_exists($key, $validated) && ($validated[$key] !== null || in_array($key, ['INVOICE_NO_PREFIX', 'QUOTE_NO_PREFIX']))) {
                    Param::put($key, $validated[$key]);
                }
            }
        });
        return $this->showInvoicing();
    }
    public function showWorkingTime() {
        $user       = Auth::user();
        $employment = $user->activeEmployment;
        $hpd        = $employment?->averageHoursPerWorkday() ?: 8;
        $grant      = $user->vacation_grants()->where('expires_at', '>', now())->latest()->first();
        return [
            'hours'         => array_combine(UserEmployment::DAYS, array_map(fn ($_) => $employment ? (float)$employment->$_ : (in_array($_, ['sa', 'su']) ? 0 : 8), UserEmployment::DAYS)),
            'work_zip'      => (string)$user->work_zip,
            'vacation_days' => $grant ? round($grant->amount / $hpd, 1) : self::DEFAULT_VACATION_DAYS,
        ];
    }
    public function updateWorkingTime(UpdateWorkingTimeRequest $request) {
        $validated = $request->validated();
        $user      = Auth::user();
        DB::transaction(function () use ($validated, $user) {
            $user->assignWorkingHours(array_map('floatval', $validated['hours']));
            $user->work_zip = $validated['work_zip'];
            $user->save();
            $user->grantVacationDays((float)$validated['vacation_days']);
        });
        return $this->showWorkingTime();
    }
    private function item(string $key, bool $required, array $checks): array {
        $missing = array_keys(array_filter($checks, fn ($_) => ! $_));
        return ['key' => $key, 'required' => $required, 'missing' => $missing, 'done' => ! $missing];
    }
}
