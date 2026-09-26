<?php

namespace App\DAV;

use Illuminate\Http\Response;
use Sabre\HTTP\ResponseInterface;
use Sabre\HTTP\Sapi;

/**
 * Sabre writes its response straight to php://output via Sapi::sendResponse(), which
 * leaves Laravel unable to send its own headers afterwards. Swapping this in keeps the
 * response inside Server::$httpResponse so the controller can hand it back to Laravel.
 */
class CapturingSapi extends Sapi {
    public static function sendResponse(ResponseInterface $response) {
        // noop - the response is read off the server instead
    }

    public static function toLaravelResponse(ResponseInterface $response): Response {
        $body = $response->getBody();
        if (is_resource($body)) {
            $body = stream_get_contents($body);
        }
        return new Response((string)$body, $response->getStatus(), $response->getHeaders());
    }
}
