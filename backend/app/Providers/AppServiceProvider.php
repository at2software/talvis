<?php

namespace App\Providers;

use App\Http\Controllers\PluginMattermostController;
use App\Models\MarketingProspect;
use App\Models\User;
use App\Observers\MarketingProspectObserver;
use App\Services\DatabaseSchemaService;
use App\Support\LiveSyncBroadcaster;
use App\Support\SeededIdExamples;
use Dedoc\Scramble\Scramble;
use Dedoc\Scramble\Support\Generator\OpenApi;
use Dedoc\Scramble\Support\Generator\SecurityScheme;
use Illuminate\Auth\Events\Registered;
use Illuminate\Auth\Listeners\SendEmailVerificationNotification;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider {
    public function register(): void {
        $this->app->singleton(LiveSyncBroadcaster::class);
        $this->app->bind(PluginMattermostController::class, fn () => PluginMattermostController::createInstance());
    }
    public function boot(): void {
        MarketingProspect::observe(MarketingProspectObserver::class);

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute(config('app.api_rate_limit'))->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('icons', function (Request $request) {
            return Limit::perMinute(2000)->by($request->user()?->id ?: $request->ip());
        });

        Event::listen(Registered::class, SendEmailVerificationNotification::class);

        Event::listen(MigrationsEnded::class, fn () => Cache::forget(DatabaseSchemaService::CACHE_KEY));

        $this->configureApiDocs();
    }
    private function configureApiDocs(): void {
        Gate::define('viewApiDocs', fn (?User $user = null) => app()->environment('staging'));

        Scramble::configure()
            ->routes(fn (Route $route) => Str::startsWith($route->uri, 'api/')
                && ! Str::startsWith($route->uri, ['api/commands', 'api/caldav', 'api/carddav']))
            ->withOperationTransformers(SeededIdExamples::class)
            ->withDocumentTransformers(fn (OpenApi $openApi) => $openApi->secure(SecurityScheme::http('bearer')));
    }
}
