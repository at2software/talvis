<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class HasAccessTokenMiddleware {
    public function handle(Request $request, Closure $next, $key, $value): Response {
        $token = $request->header($key);
        if (! $token || ! strlen($token)) {
            $token = $request->{$key}; // check POST and GET variables as well
        }
        if ($token !== $value) {
            return response()->json(['message' => 'Not authenticated'], 401);
        }
        return $next($request);
    }
}
