<?php

namespace App\Flow\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class MachineController extends Controller {
    public function me(Request $request) {
        $machine = $request->user();
        $token   = $machine->currentAccessToken();
        return [
            'machine'    => $machine->name,
            'token'      => $token->name,
            'abilities'  => $token->abilities,
            'expires_at' => $token->expires_at,
        ];
    }
}
