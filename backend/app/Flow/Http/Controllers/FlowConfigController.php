<?php

namespace App\Flow\Http\Controllers;

use App\Flow\Models\JobType;
use App\Flow\Models\Phase;
use App\Flow\Models\RiskClass;
use App\Http\Controllers\Controller;

class FlowConfigController extends Controller {
    public function phases() {
        return [
            'phases'       => Phase::with('gates')->orderBy('sort')->get(),
            'risk_classes' => RiskClass::orderBy('level')->get(),
            'job_types'    => JobType::orderBy('key')->get(),
        ];
    }
    public function jobTypes() {
        return JobType::orderBy('name')->get();
    }
    public function riskClasses() {
        return RiskClass::orderBy('level')->get();
    }
}
