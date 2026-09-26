<?php

/**
 * Asserts that Reverb answers a real client handshake, not merely that the port is open.
 *
 * A port check would have passed for the entire period issues#563 was broken: Reverb
 * accepts the TCP connection and the HTTP upgrade, then rejects the app over the socket
 * with pusher:error 4001. Only the first frame distinguishes healthy from useless.
 *
 * Usage: php deploy/reverb-health.php [host] [port]
 * Exits 0 when healthy, 1 otherwise.
 */

$root = dirname(__DIR__);
$host = $argv[1] ?? '127.0.0.1';
$port = (int)($argv[2] ?? 6001);

function fail(string $message): never {
    fwrite(STDERR, "UNHEALTHY: $message\n");
    exit(1);
}

$envPath = "$root/.env";
if (! is_readable($envPath)) {
    fail("cannot read $envPath");
}

// INI_SCANNER_RAW keeps surrounding quotes, and .env values here are inconsistently quoted.
$env      = parse_ini_file($envPath, false, INI_SCANNER_RAW) ?: [];
$envValue = fn (string $name): string => trim((string)($env[$name] ?? ''), " \t\n\r\0\x0B\"'");

// The key the browser is served must be the key Reverb registered its app under.
$key = $envValue('PUSHER_APP_KEY') ?: $envValue('REVERB_APP_KEY');
if ($key === '') {
    fail('neither PUSHER_APP_KEY nor REVERB_APP_KEY is set in .env');
}

// Reverb binds the port only after a full Laravel boot, so a deploy that restarts the
// service reaches this script while the port can still be refusing connections.
$deadline = time() + 30;
do {
    $socket = @fsockopen($host, $port, $errno, $errstr, 8);
    if ($socket) {
        break;
    }
    usleep(500000);
} while (time() < $deadline);

if (! $socket) {
    fail("cannot connect to $host:$port after 30s ($errstr)");
}
stream_set_timeout($socket, 8);

$nonce   = base64_encode(random_bytes(16));
$request = "GET /app/$key?protocol=7&client=health&version=1.0 HTTP/1.1\r\n"
    ."Host: $host:$port\r\n"
    ."Upgrade: websocket\r\n"
    ."Connection: Upgrade\r\n"
    ."Sec-WebSocket-Key: $nonce\r\n"
    ."Sec-WebSocket-Version: 13\r\n\r\n";
fwrite($socket, $request);

$response = '';
while (! str_contains($response, "\r\n\r\n")) {
    $chunk = fread($socket, 4096);
    if ($chunk === '' || $chunk === false) {
        fail('connection closed during handshake');
    }
    $response .= $chunk;
}

if (! preg_match('#^HTTP/1\.1 101#', $response)) {
    fail('no websocket upgrade: '.strtok($response, "\r\n"));
}

$frame = substr($response, strpos($response, "\r\n\r\n") + 4);
while (strlen($frame) < 2) {
    $chunk = fread($socket, 4096);
    if ($chunk === '' || $chunk === false) {
        fail('Reverb upgraded the connection but sent no frame');
    }
    $frame .= $chunk;
}

$length = ord($frame[1]) & 127;
$offset = 2;
if ($length === 126) {
    $length = unpack('n', substr($frame, 2, 2))[1];
    $offset = 4;
}
while (strlen($frame) < $offset + $length) {
    $chunk = fread($socket, 4096);
    if ($chunk === '' || $chunk === false) {
        break;
    }
    $frame .= $chunk;
}
fclose($socket);

$payload = substr($frame, $offset, $length);
$event   = json_decode($payload, true);

if (($event['event'] ?? null) !== 'pusher:connection_established') {
    fail("Reverb refused the handshake: $payload");
}

echo "healthy: Reverb accepted app key on $host:$port\n";

// The check above talks to Reverb directly and so proves nothing about nginx. A malformed
// `error_page 401 =401;` once turned the 401 into a 302 to the literal URI "=401", and since
// WebSocket forbids redirects every browser aborted the handshake while this script stayed
// green. Unauthenticated is expected here; a redirect is not.
$publicUrl = rtrim($envValue('APP_URL'), '/');
if ($publicUrl === '') {
    echo "skipped edge check: APP_URL not set\n";
    exit(0);
}

$ch = curl_init("$publicUrl/app/$key?protocol=7&client=health&version=1.0");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 10,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HTTPHEADER     => [
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: '.base64_encode(random_bytes(16)),
    ],
]);
curl_exec($ch);
$status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($status >= 300 && $status < 400) {
    fail("nginx redirected the websocket handshake (HTTP $status) - browsers abort on this; check error_page on the /app/ location");
}
if ($status === 0) {
    fail("no response from $publicUrl/app/ - is nginx proxying the /app/ location?");
}

echo "healthy: nginx answered the edge handshake with HTTP $status (no redirect)\n";
exit(0);
