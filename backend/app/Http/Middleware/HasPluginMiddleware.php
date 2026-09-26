<?php

namespace App\Http\Middleware;

use App\Models\Vault;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class HasPluginMiddleware {
    public function handle(Request $request, Closure $next, $pluginKey): Response {
        // if (!Vault::isActive($pluginKey)) {
        //     return response("This instance of TALVIS does not have '$pluginKey' and additional information set up", 503);
        // }
        return $next($request);
    }
}
