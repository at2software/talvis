<?php

use App\Exceptions\InvoiceDataException;
use App\Exceptions\ProjectStateTransitionRejected;
use App\Exceptions\SsrfException;
use App\Http\Middleware\Authenticate;
use App\Http\Middleware\AuthenticateBroadcasting;
use App\Http\Middleware\CompatibleRoleMiddleware;
use App\Http\Middleware\EncryptCookies;
use App\Http\Middleware\HasAccessTokenMiddleware;
use App\Http\Middleware\HasPermissionsForInvoiceItemMiddleware;
use App\Http\Middleware\HasPluginMiddleware;
use App\Http\Middleware\HrMiddleware;
use App\Http\Middleware\HttpRedirect;
use App\Http\Middleware\KeycloakAuthMiddleware;
use App\Http\Middleware\OwnerMiddleware;
use App\Http\Middleware\PreventRequestsDuringMaintenance;
use App\Http\Middleware\RedirectIfAuthenticated;
use App\Http\Middleware\ReleaseSessionLock;
use App\Http\Middleware\SecureApiResponses;
use App\Http\Middleware\SelfMiddleware;
use App\Http\Middleware\TrimStrings;
use App\Http\Middleware\TrustProxies;
use App\Http\Middleware\ValidateSignature;
use App\Http\Middleware\VerifyCsrfToken;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\Middleware\AuthenticateWithBasicAuth;
use Illuminate\Auth\Middleware\Authorize;
use Illuminate\Auth\Middleware\EnsureEmailIsVerified;
use Illuminate\Auth\Middleware\RequirePassword;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Foundation\Http\Middleware\HandlePrecognitiveRequests;
use Illuminate\Foundation\Http\Middleware\ValidatePostSize;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Middleware\SetCacheHeaders;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Session\Middleware\AuthenticateSession;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Context;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use KeycloakGuard\Exceptions\TokenException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->use([
            TrustProxies::class,
            SecureApiResponses::class,
            HandleCors::class,
            PreventRequestsDuringMaintenance::class,
            ValidatePostSize::class,
            TrimStrings::class,
            HttpRedirect::class,
        ]);

        $middleware->group('web', [
            EncryptCookies::class,
            AddQueuedCookiesToResponse::class,
            StartSession::class,
            ShareErrorsFromSession::class,
            VerifyCsrfToken::class,
            SubstituteBindings::class,
        ]);

        $middleware->group('api', [
            ThrottleRequests::class.':api',
            SubstituteBindings::class,
        ]);

        $middleware->alias([
            'apikey'                 => HasAccessTokenMiddleware::class,
            'auth'                   => Authenticate::class,
            'auth.basic'             => AuthenticateWithBasicAuth::class,
            'auth.session'           => AuthenticateSession::class,
            'auth.keycloak'          => KeycloakAuthMiddleware::class,
            'auth.broadcasting'      => AuthenticateBroadcasting::class,
            'cache.headers'          => SetCacheHeaders::class,
            'can'                    => Authorize::class,
            'guest'                  => RedirectIfAuthenticated::class,
            'password.confirm'       => RequirePassword::class,
            'precognitive'           => HandlePrecognitiveRequests::class,
            'signed'                 => ValidateSignature::class,
            'throttle'               => ThrottleRequests::class,
            'verified'               => EnsureEmailIsVerified::class,
            'role'                   => CompatibleRoleMiddleware::class,
            'owner'                  => OwnerMiddleware::class,
            'self'                   => SelfMiddleware::class,
            'permission_invoiceItem' => HasPermissionsForInvoiceItemMiddleware::class,
            'hr_permission'          => HrMiddleware::class,
            'has_plugin'             => HasPluginMiddleware::class,
            'release.session'        => ReleaseSessionLock::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->dontFlash([
            'current_password',
            'password',
            'password_confirmation',
        ]);

        $exceptions->render(function (SsrfException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        });

        $exceptions->render(function (InvoiceDataException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        });

        $exceptions->render(function (ProjectStateTransitionRejected $e) {
            return response()->json(['message' => $e->getMessage(), 'errors' => ['state' => [$e->getMessage()]]], 422);
        });

        $exceptions->render(function (AuthenticationException $e, $request) {
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
            return redirect()->guest(route('login'));
        });

        $exceptions->render(function (TokenException $e) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        });
        $exceptions->dontReport(TokenException::class);

        $errorId = function (): string {
            if (! Context::hasHidden('error_id')) {
                Context::addHidden('error_id', Str::upper(Str::random(8)));
            }
            return Context::getHidden('error_id');
        };

        $exceptions->context(fn () => ['error_id' => $errorId()]);

        $exceptions->render(function (Throwable $e, Request $request) use ($errorId) {
            if (config('app.debug') || ! $request->is('api/*')) {
                return null;
            }
            if ($e instanceof HttpExceptionInterface || $e instanceof HttpResponseException || $e instanceof ValidationException) {
                return null;
            }
            $id = $errorId();
            return response()->json([
                'message'  => "Internal error – please contact your administrator (reference: $id)",
                'error_id' => $id,
            ], 500);
        });
    })->create();
