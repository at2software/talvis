<?php

namespace Tests\Feature\Http;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RouteActionsExistTest extends TestCase {
    public function test_every_controller_route_resolves_to_an_existing_method(): void {
        $missing = [];
        foreach (Route::getRoutes() as $route) {
            $action = $route->getAction('uses');
            if (! is_string($action) || ! str_contains($action, '@')) {
                continue;
            }
            [$class, $method] = explode('@', $action);
            if (! method_exists($class, $method)) {
                $missing[] = implode('|', $route->methods()).' '.$route->uri()." → $action";
            }
        }
        $this->assertSame([], $missing);
    }
}
