<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SecureApiResponses {
    private const API_PATHS  = ['api', 'api/*'];
    private const DOCS_PATHS = ['docs', 'docs/*'];
    private const DAV_PATHS  = ['api/carddav', 'api/carddav/*', 'api/caldav', 'api/caldav/*'];

    public function handle(Request $request, Closure $next): Response {
        if (! $request->is(...self::API_PATHS, ...self::DOCS_PATHS)) {
            return $next($request);
        }
        if ($request->is(...self::API_PATHS) && ! $request->is(...self::DAV_PATHS)) {
            $request->headers->set('Accept', 'application/json');
        }

        $response = $next($request);

        $this->setMissing($response, [
            'X-Content-Type-Options' => 'nosniff',
            'Referrer-Policy'        => 'no-referrer',
            ...$this->frameHeaders($response),
            ...($request->secure() ? ['Strict-Transport-Security' => 'max-age=31536000'] : []),
        ]);
        return $response;
    }
    private function frameHeaders(Response $response): array {
        if (! $this->isDocument($response)) {
            return [
                'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'",
                'X-Frame-Options'         => 'DENY',
            ];
        }
        $origins = array_diff(config('cors.allowed_origins', []), ['*']);
        return [
            'Content-Security-Policy' => trim("frame-ancestors 'self' ".implode(' ', $origins)),
            'X-Frame-Options'         => 'SAMEORIGIN',
        ];
    }
    private function isDocument(Response $response): bool {
        $type = (string)$response->headers->get('Content-Type');
        return $response instanceof BinaryFileResponse
            || $response instanceof StreamedResponse
            || ($type !== '' && ! str_contains($type, 'json'));
    }
    private function setMissing(Response $response, array $headers): void {
        foreach ($headers as $name => $value) {
            if (! $response->headers->has($name)) {
                $response->headers->set($name, $value);
            }
        }
    }
}
