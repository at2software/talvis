<?php

namespace App\Http\Controllers;

use App\Models\LeadSource;
use Illuminate\Http\Request;

class LeadSourceController extends Controller {
    public function index() {
        return LeadSource::all();
    }
    public function show(LeadSource $lead_source) {
        return $lead_source;
    }
    public function store(Request $request) {
        return LeadSource::create((new LeadSource)->getValidFields($request->all()))->fresh();
    }
    public function destroy(LeadSource $lead_source) {
        return response()->json($lead_source->delete());
    }
}
