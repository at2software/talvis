<?php

namespace Tests\Unit\DAV;

use App\DAV\CapturingSapi;
use App\Http\Controllers\CalDAVController;
use App\Http\Controllers\CardDAVController;
use PHPUnit\Framework\TestCase;
use Sabre\DAV;
use Sabre\HTTP\Request as SabreRequest;
use Sabre\HTTP\Response as SabreResponse;

class DavServerTest extends TestCase {
    public static function serverFactoryProvider(): array {
        return [
            'carddav' => [fn (\PDO $pdo) => (new CardDAVController)->createCardDAVServer($pdo)],
            'caldav'  => [fn (\PDO $pdo) => (new CalDAVController)->createCalDAVServer($pdo)],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('serverFactoryProvider')]
    public function test_server_does_not_expose_its_version(callable $factory): void {
        DAV\Server::$exposeVersion = true;

        $server               = $factory(new \PDO('sqlite::memory:'));
        $server->httpRequest  = new SabreRequest('OPTIONS', '/');
        $server->httpResponse = new SabreResponse;
        $server->start();

        $this->assertNull($server->httpResponse->getHeader('X-Sabre-Version'));
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('serverFactoryProvider')]
    public function test_server_uses_the_capturing_sapi(callable $factory): void {
        $server = $factory(new \PDO('sqlite::memory:'));

        $this->assertInstanceOf(CapturingSapi::class, $server->sapi);
    }
}
