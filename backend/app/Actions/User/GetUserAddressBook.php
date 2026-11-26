<?php

namespace App\Actions\User;

use App\Models\Company;
use App\Models\Invoice;
use App\Models\User;

class GetUserAddressBook {
    public function execute(User $user): array {
        $addressbook = [];

        if ($user->hasAnyRole(['admin', 'hr', 'project_manager'])) {
            foreach (User::whereEmployed()->whereNot('id', 0)->get() as $employee) {
                $addressbook[] = $employee->getAddressBookVcard();
            }
        } else {
            $adminProjectManagers = User::whereHas('roles', fn ($query) => $query->whereIn('name', ['admin', 'project_manager']))
                ->whereEmployed()
                ->whereNot('id', 0)
                ->get();
            foreach ($adminProjectManagers as $manager) {
                $addressbook[] = $manager->getCompactVcard();
            }
        }

        $companies = $user->assigned_companies;
        $projects  = $user->assigned_projects()->with('company')->get();
        foreach ($projects as $project) {
            $companies->push($project->company);
        }

        $invoices = Invoice::whereAfter(now()->subYears(2))->with('company')->get();
        foreach ($invoices as $invoice) {
            $companies->push($invoice->company);
        }

        $companies = $companies->unique('id');
        foreach ($companies as $company) {
            $vcards = $this->getVcardsForCompany($company);
            foreach ($vcards as $vcard) {
                $addressbook[] = $vcard;
            }
        }
        return $addressbook;
    }
    private function getVcardsForCompany(Company $company): array {
        $response  = [];
        $employees = $company->employees()->with('contact')->get();
        foreach ($employees as $employee) {
            $text       = $employee->contact->toVCard();
            $response[] = $text;
        }
        return $response;
    }
}
