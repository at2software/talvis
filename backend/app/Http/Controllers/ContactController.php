<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\CompanyContact;
use App\Models\Contact;
use Illuminate\Http\Request;

class ContactController extends Controller {
    public function update(Request $request, int $id) {
        return Contact::findOrFail($id)->applyAndSave($request);
    }
    public function updateAddLinkedIn(Request $request, Contact $_) {
        $validated = $request->validate(['linkedin_url' => 'required|url']);

        $vcard = $_->vcard;
        $vcard->remove('URL', 'type:linkedin'); // Remove existing LinkedIn URLs
        $vcard->setProperty('URL', $validated['linkedin_url'], ['type' => 'linkedin']);

        $_->vcard = $vcard;
        $_->save();
        return $_;
    }
    public function unlink(Contact $_, Company $company) {
        CompanyContact::whereCompanyId($company->id)->whereContactId($_->id)->delete();
        return response()->json(true);
    }
    public function maintenanceMissingBirthday() {
        return Contact::whereHasActiveCompanies()->whereMissingBirthday()->with('companies')->get();
    }
}
