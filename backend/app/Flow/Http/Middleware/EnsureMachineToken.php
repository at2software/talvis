<?php

namespace App\Flow\Http\Middleware;

use App\Flow\MachineAbility;
use App\Flow\Models\Machine;
use Closure;
use Illuminate\Http\Request;

class EnsureMachineToken {
    public function handle(Request $request, Closure $next) {
        $machine = $request->user();
        if (! $machine instanceof Machine || ! MachineAbility::onlyGrantable($machine->currentAccessToken()?->abilities ?? [])) {
            abort(403, 'This endpoint requires a flow machine token.');
        }
        return $next($request);
    }
}
