<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Middleware\Authenticate as Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class Authenticate extends Middleware {
    /**
     * @param Request $request
     * @param string[] ...$guards
     * @return mixed
     *
     * @throws AuthenticationException
     */
    public function handle($request, Closure $next, ...$guards) {
        if ($request->hasHeader('Authorization')) {
            $token = preg_replace('/^Bearer /is', '', $request->header('Authorization'));
            if (strlen($token) > 0) {
                $user = User::findByApiToken($token);
                if ($user) {
                    Auth::setUser($user);
                    $this->applyImpersonation();
                    return $next($request);
                }
            }
        }
        // Don't use parent::handle() here: it calls $next() internally, which would
        // run the controller before we get a chance to swap in the impersonated user.
        $this->authenticate($request, $guards);
        $this->applyImpersonation();
        return $next($request);
    }

    protected function applyImpersonation(): void {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }
        $impersonateId = env('IMPERSONATE_USER_ID');
        if (! $impersonateId || ! Auth::check()) {
            return;
        }
        $impersonated = User::find($impersonateId);
        if ($impersonated) {
            Auth::setUser($impersonated);
        }
    }
    protected function redirectTo($request): ?string {
        return null;
    }
}
