<?php

namespace App\Http\Controllers;

use App\Models\CompanyContact;
use Illuminate\Http\Request;

class CompanyContactController extends Controller {
    public function update(Request $request, CompanyContact $company_contact): CompanyContact {
        $company_contact->applyAndSave($request);
        $company_contact->projects;
        $company_contact->contact->load(['companyContacts' => fn ($q) => $q->whereHas('company')->with('company')]);
        return $company_contact;
    }
    public function destroy(Request $request, CompanyContact $companyContact) {
        return $companyContact->delete();
    }
    public function show(CompanyContact $company_contact): CompanyContact {
        $company_contact->projects;
        $company_contact->contact->load(['companyContacts' => fn ($q) => $q->whereHas('company')->with('company')]);
        return $company_contact;
    }
    public function store(Request $request) {
        $new = new CompanyContact;
        $new->applyAndSave($request);
        $new->fresh();
        $new->company->name;
        return $new;
    }
}
