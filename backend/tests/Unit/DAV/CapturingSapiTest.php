<?php

namespace Tests\Unit\DAV;

use App\DAV\CapturingSapi;
use PHPUnit\Framework\TestCase;
use Sabre\DAV;
use Sabre\HTTP\Request as SabreRequest;
use Sabre\HTTP\Response as SabreResponse;

class CapturingSapiTest extends TestCase {
    public function test_send_response_writes_nothing_to_output(): void {
        $sapi = new CapturingSapi;

        ob_start();
        $sapi->sendResponse(new SabreResponse(207, [], '<d:multistatus/>'));
        $leaked = ob_get_clean();

        $this->assertSame('', $leaked);
    }

    public function test_a_full_server_run_leaves_the_response_on_the_server(): void {
        $server               = new DAV\Server([], new CapturingSapi);
        $server->httpRequest  = new SabreRequest('OPTIONS', '/');
        $server->httpResponse = new SabreResponse;

        ob_start();
        $server->start();
        $leaked = ob_get_clean();

        $this->assertSame('', $leaked);
        $this->assertSame(200, $server->httpResponse->getStatus());
    }

    public function test_to_laravel_response_carries_status_headers_and_body(): void {
        $response = CapturingSapi::toLaravelResponse(
            new SabreResponse(207, ['Content-Type' => 'application/xml'], '<d:multistatus/>')
        );

        $this->assertSame(207, $response->getStatusCode());
        $this->assertSame('application/xml', $response->headers->get('Content-Type'));
        $this->assertSame('<d:multistatus/>', $response->getContent());
    }

    public function test_to_laravel_response_reads_a_stream_body(): void {
        $stream = fopen('php://memory', 'r+');
        fwrite($stream, 'BEGIN:VCALENDAR');
        rewind($stream);

        $response = CapturingSapi::toLaravelResponse(new SabreResponse(200, [], $stream));

        $this->assertSame('BEGIN:VCALENDAR', $response->getContent());
    }
}
