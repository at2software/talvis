<?php

namespace App\Services;

use App\Exceptions\SsrfException;

class SafeUrlGuard {
    /** @return list<string> */
    public function validate(string $url): array {
        $parsed = parse_url($url);

        if (! $parsed || ! isset($parsed['scheme'], $parsed['host'])) {
            throw new SsrfException('Invalid URL format.');
        }

        if (! in_array($parsed['scheme'], ['http', 'https'], true)) {
            throw new SsrfException('Only http and https schemes are allowed.');
        }

        $host = $parsed['host'];

        // Strip IPv6 brackets  e.g. [::1] → ::1
        if (str_starts_with($host, '[') && str_ends_with($host, ']')) {
            $host = substr($host, 1, -1);
        }

        if (in_array(strtolower($host), ['localhost', 'ip6-localhost', 'ip6-loopback'], true)) {
            throw new SsrfException('Requests to localhost are not allowed.');
        }

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            if ($this->isBlocked($host)) {
                throw new SsrfException('Requests to private or reserved IP addresses are not allowed.');
            }

            return [$host];
        }

        $ips = $this->resolveHost($host);

        if (empty($ips)) {
            throw new SsrfException('Unable to resolve hostname.');
        }

        foreach ($ips as $ip) {
            if ($this->isBlocked($ip)) {
                throw new SsrfException("Resolved IP {$ip} is in a private or reserved range.");
            }
        }

        return $ips;
    }

    public function pinnedCurlOptions(string $url): array {
        $ips    = $this->validate($url);
        $parsed = parse_url($url);
        $host   = trim($parsed['host'], '[]');
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [];
        }
        $port      = $parsed['port'] ?? ($parsed['scheme'] === 'https' ? 443 : 80);
        $addresses = array_map(fn (string $ip) => str_contains($ip, ':') ? "[$ip]" : $ip, $ips);

        return [CURLOPT_RESOLVE => ["$host:$port:".implode(',', $addresses)]];
    }
    private function resolveHost(string $host): array {
        $ips = gethostbynamel($host) ?: [];

        $aaaaRecords = @dns_get_record($host, DNS_AAAA);
        if ($aaaaRecords) {
            foreach ($aaaaRecords as $record) {
                if (isset($record['ipv6'])) {
                    $ips[] = $record['ipv6'];
                }
            }
        }

        return $ips;
    }
    private function isBlocked(string $ip): bool {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $long   = ip2long($ip);
            $ranges = [
                [ip2long('0.0.0.0'),     ip2long('0.255.255.255')],   // 0/8 reserved
                [ip2long('10.0.0.0'),    ip2long('10.255.255.255')],   // 10/8 private
                [ip2long('100.64.0.0'),  ip2long('100.127.255.255')],  // 100.64/10 CGN
                [ip2long('127.0.0.0'),   ip2long('127.255.255.255')],  // 127/8 loopback
                [ip2long('169.254.0.0'), ip2long('169.254.255.255')],  // 169.254/16 link-local
                [ip2long('172.16.0.0'),  ip2long('172.31.255.255')],   // 172.16/12 private
                [ip2long('192.0.0.0'),   ip2long('192.0.0.255')],      // 192.0.0/24 IETF protocol
                [ip2long('192.168.0.0'), ip2long('192.168.255.255')],  // 192.168/16 private
                [ip2long('198.18.0.0'),  ip2long('198.19.255.255')],   // 198.18/15 benchmark
                [ip2long('240.0.0.0'),   ip2long('255.255.255.255')],  // 240/4 reserved
            ];
            foreach ($ranges as [$start, $end]) {
                if ($long >= $start && $long <= $end) {
                    return true;
                }
            }

            return false;
        }

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
            $bin = inet_pton($ip);
            // ::1 loopback
            if ($bin === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01") {
                return true;
            }
            // fc00::/7 unique local (covers fd00::/8 too)
            if ((ord($bin[0]) & 0xFE) === 0xFC) {
                return true;
            }
            // fe80::/10 link-local
            if (ord($bin[0]) === 0xFE && (ord($bin[1]) & 0xC0) === 0x80) {
                return true;
            }
            // ::ffff:0:0/96 IPv4-mapped — check the embedded IPv4 address
            if (substr($bin, 0, 12) === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff") {
                $ipv4 = long2ip(unpack('N', substr($bin, 12))[1]);

                return $this->isBlocked($ipv4);
            }

            return false;
        }

        return true; // Unknown format — block
    }
}
