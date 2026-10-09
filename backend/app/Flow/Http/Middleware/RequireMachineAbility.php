<?php

namespace App\Flow\Http\Middleware;

use App\Flow\Models\Machine;
use Closure;
use Illuminate\Http\Request;

class RequireMachineAbility {
    public function handle(Request $request, Closure $next, string $ability) {
        $user = $request->user();
        if ($user instanceof Machine && ! $user->hasAbility($ability)) {
            abort(403, "The machine token lacks the ability {$ability}.");
        }
        return $next($request);
    }
}
