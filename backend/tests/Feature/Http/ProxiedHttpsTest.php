<?php

namespace Tests\Feature\Http;

use App\Http\Middleware\HttpRedirect;
use App\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Tests\TestCase;

class ProxiedHttpsTest extends TestCase {
    protected function tearDown(): void {
        Request::setTrustedProxies([], Request::HEADER_X_FORWARDED_FOR);
        parent::tearDown();
    }
    private function fromProxy(string $uri, array $headers = []): Request {
        $server = ['REMOTE_ADDR' => '127.0.0.1'];
        foreach ($headers as $name => $value) {
            $server['HTTP_'.str_replace('-', '_', strtoupper($name))] = $value;
        }

        $request = Request::create($uri, 'GET', [], [], [], $server);
        (new TrustProxies)->handle($request, fn (Request $passed) => $passed);

        return $request;
    }
    private function inProduction(string $appUrl): void {
        config(['app.url' => $appUrl]);
        $this->app->detectEnvironment(fn () => 'production');
    }
    public function test_forwarded_proto_from_a_trusted_proxy_marks_the_request_secure(): void {
        $request = $this->fromProxy('http://talvis.test/api/login', ['X-Forwarded-Proto' => 'https']);

        $this->assertTrue($request->secure());
    }
    public function test_no_redirect_when_the_proxy_terminated_tls(): void {
        $this->inProduction('https://talvis.test/backend');

        $request  = $this->fromProxy('http://talvis.test/api/login', ['X-Forwarded-Proto' => 'https']);
        $response = (new HttpRedirect)->handle($request, fn () => response('ok'));

        $this->assertSame('ok', $response->getContent());
    }
    public function test_redirect_keeps_the_path_prefix_the_proxy_stripped(): void {
        $this->inProduction('https://talvis.test/backend');

        $request  = $this->fromProxy('http://talvis.test/api/login?next=1');
        $response = (new HttpRedirect)->handle($request, fn () => response('ok'));

        $this->assertSame('https://talvis.test/backend/api/login?next=1', $response->headers->get('Location'));
    }
}
