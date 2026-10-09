<?php

namespace App\Services;

use App\Models\UptimeCheck;
use App\Models\UptimeMonitor;
use Carbon\Carbon;
use GuzzleHttp\Psr7\Uri;
use GuzzleHttp\Psr7\UriResolver;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class UptimeCheckService {
    private const MAX_REDIRECTS = 5;

    public function __construct(private SafeUrlGuard $guard) {}

    public function performCheck(UptimeMonitor $monitor): UptimeCheck {
        $startTime    = microtime(true);
        $status       = 'down';
        $responseTime = null;
        $statusCode   = null;
        $errorMessage = null;

        try {
            $response = $this->request($monitor);

            $responseTime = (int)round((microtime(true) - $startTime) * 1000);
            $statusCode   = $response->status();

            if ($statusCode === $monitor->expected_status_code) {
                if ($responseTime <= $monitor->response_time_threshold) {
                    $status = 'up';
                } else {
                    $status       = 'degraded';
                    $errorMessage = "Slow response: {$responseTime}ms (threshold: {$monitor->response_time_threshold}ms)";
                }
            } else {
                $status       = 'down';
                $errorMessage = "Unexpected status code: {$statusCode} (expected: {$monitor->expected_status_code})";
            }
        } catch (ConnectionException $e) {
            $responseTime = (int)round((microtime(true) - $startTime) * 1000);
            $status       = 'down';
            $errorMessage = 'Connection failed: '.$e->getMessage();
            Log::warning("Uptime check failed for monitor {$monitor->id}: ".$e->getMessage());
        } catch (\Exception $e) {
            $responseTime = (int)round((microtime(true) - $startTime) * 1000);
            $status       = 'down';
            $errorMessage = 'Error: '.$e->getMessage();
            Log::error("Uptime check error for monitor {$monitor->id}: ".$e->getMessage());
        }

        $check = UptimeCheck::create([
            'uptime_monitor_id' => $monitor->id,
            'checked_at'        => Carbon::now(),
            'status'            => $status,
            'response_time'     => $responseTime,
            'status_code'       => $statusCode,
            'error_message'     => $errorMessage,
        ]);

        $monitor->update([
            'last_check_at' => Carbon::now(),
            'last_status'   => $status,
        ]);
        return $check;
    }
    private function request(UptimeMonitor $monitor): Response {
        $method = $monitor->method;
        $url    = $monitor->url;
        $config = [
            'timeout'         => $monitor->timeout,
            'connect_timeout' => 10,
            'verify'          => ! $monitor->skip_ssl_verification,
            'allow_redirects' => false,
            ...($monitor->request_headers ? ['headers' => $monitor->request_headers] : []),
        ];

        for ($hop = 0; ; $hop++) {
            $client   = Http::withOptions([...$config, 'curl' => $this->guard->pinnedCurlOptions($url)]);
            $response = match ($method) {
                'GET'   => $client->get($url),
                'HEAD'  => $client->head($url),
                'POST'  => $client->post($url, $monitor->request_body ?? ''),
                default => throw new \Exception('Unsupported HTTP method: '.$method),
            };

            $location = $response->header('Location');
            if (! $response->redirect() || ! $location || $hop === self::MAX_REDIRECTS) {
                return $response;
            }
            $url = (string)UriResolver::resolve(new Uri($url), new Uri($location));
            if ($method === 'POST' && ! in_array($response->status(), [307, 308], true)) {
                $method = 'GET';
            }
        }
    }
    public function shouldNotify(UptimeMonitor $monitor, UptimeCheck $check): bool {
        if ($check->status === 'up') {
            return false;
        }

        $previousCheck = $monitor->checks()
            ->where('id', '!=', $check->id)
            ->latest('checked_at')
            ->first();

        if (! $previousCheck) {
            return true;
        }
        if ($previousCheck->status === 'up' && $check->status !== 'up') {
            return true;
        }

        if ($monitor->last_notified_at && Carbon::now()->diffInHours($monitor->last_notified_at) >= 24) {
            return true;
        }
        return false;
    }
    public function shouldNotifyRecovery(UptimeMonitor $monitor, UptimeCheck $check): bool {
        if ($check->status !== 'up') {
            return false;
        }

        $previousCheck = $monitor->checks()
            ->where('id', '!=', $check->id)
            ->latest('checked_at')
            ->first();
        return $previousCheck && $previousCheck->status !== 'up';
    }
    public function cleanupOldChecks(int $daysToKeep = 90): int {
        $cutoffDate = Carbon::now()->subDays($daysToKeep);
        return UptimeCheck::where('checked_at', '<', $cutoffDate)->delete();
    }
}
