<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SelfMiddleware {
    public function handle(Request $request, Closure $next): Response {
        $user = $request->user() ?? abort(401);
        abort_unless($user->hasAnyRole(['admin']) || (string)$request->route('_') === (string)$user->getKey(), 403, 'Unauthorized');
        return $next($request);
    }
}
