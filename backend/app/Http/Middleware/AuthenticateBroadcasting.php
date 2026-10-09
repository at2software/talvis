<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Log;

class AuthenticateBroadcasting {
    public function handle($request, Closure $next) {
        Config::set('auth.defaults.guard', 'api-token');

        Log::info('Broadcasting auth middleware called');

        if ($request->hasHeader('Authorization')) {
            $authHeader = $request->header('Authorization');
            $token      = preg_replace('/^Bearer /i', '', $authHeader);

            Log::info('Token extracted', [
                'length' => strlen($token),
                'is_jwt' => str_contains($token, '.'),
            ]);

            if (strlen($token) > 0) {
                $user = User::findByApiToken($token);

                if (! $user && str_contains($token, '.')) {
                    try {
                        Config::set('auth.defaults.guard', 'api');
                        $request->headers->set('Authorization', 'Bearer '.$token);
                        $user = Auth::guard('api')->user();
                    } catch (\Exception $e) {
                        Log::warning('Keycloak auth failed', ['error' => $e->getMessage()]);
                    }
                }

                Log::info('User lookup', ['found' => $user !== null]);

                if ($user) {
                    Auth::guard('api-token')->setUser($user);
                    $request->setUserResolver(function () use ($user) {
                        return $user;
                    });

                    Log::info('User authenticated successfully', ['user_id' => $user->id]);
                    return $next($request);
                }
            }
        }

        Log::warning('Broadcasting auth failed');
        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
