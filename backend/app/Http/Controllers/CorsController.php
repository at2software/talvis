<?php

namespace App\Http\Controllers;

use App\Http\Requests\Cors\CurlIdRequest;
use App\Http\Requests\Cors\CurlRequest;
use App\Services\SafeUrlGuard;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class CorsController extends Controller {
    public function __construct(private SafeUrlGuard $guard) {}

    public function curlId(CurlIdRequest $request, int $id) {
        $url       = $request->validated('url');
        $separator = str_contains($url, '?') ? '&' : '?';

        return $this->send($request, $url.$separator.http_build_query([$request->validated('idKey') => $id]));
    }
    public function curl(CurlRequest $request) {
        return $this->send($request, $request->validated('url'));
    }
    private function send(CurlRequest $request, string $url): JsonResponse {
        $method  = Str::upper($request->validated('method'));
        $headers = $this->parseHeaders($request->validated('headers') ?? []);
        $timeout = $request->validated('timeout') ?? 5;
        $data    = $request->validated('data');

        $body = [];
        if ($data) {
            $body = in_array($method, ['POST', 'PUT', 'PATCH'])
                ? ['json' => $data]
                : ['query' => $data];
        }

        try {
            $response = $this->guard->send($method, $url, $headers, $timeout, $body);
        } catch (ConnectionException $e) {
            return response()->json(['error' => $e->getMessage()], 502);
        }

        $decoded = json_decode($response->body());
        $payload = json_last_error() === JSON_ERROR_NONE ? $decoded : ['raw_response' => trim($response->body())];

        return response()->json($payload, 200, [], JSON_INVALID_UTF8_SUBSTITUTE);
    }
    private function parseHeaders(array $rawHeaders): array {
        $headers = [];
        foreach ($rawHeaders as $line) {
            [$name, $value]        = explode(':', $line, 2);
            $headers[trim($name)]  = trim($value);
        }

        return $headers;
    }
}
