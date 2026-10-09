<?php

namespace App\Flow\Http\Controllers;

use App\Flow\Models\Transition;
use App\Http\Controllers\Controller;

class TransitionController extends Controller {
    public function index() {
        return Transition::active()->orderBy('from_state_id')->orderBy('to_state_id')->get(['id', 'from_state_id', 'to_state_id', 'required_role']);
    }
}
