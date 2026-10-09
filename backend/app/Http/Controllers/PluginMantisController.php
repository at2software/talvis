<?php

namespace App\Http\Controllers;

use App\Traits\HasVaultCredentials;
use Carbon\Carbon;
use Carbon\CarbonInterface;

class PluginMantisController extends PluginController {
    use HasVaultCredentials;

    private const PAGE_SIZE = 50;
    private const MAX_PAGES = 10;

    public static function getKey(): string {
        return 'mantis';
    }
    public function vaultPrefix(): string {
        return 'MANTIS';
    }
    public static function createInstance(): ?static {
        $instance              = new static;
        $instance->credentials = $instance->getCredentials();
        return $instance->baseUrl() ? $instance->connect() : null;
    }
    public function __construct(?array $credentials = null) {
        if ($credentials !== null) {
            $this->credentials = $credentials;
            if ($this->baseUrl()) {
                $this->connect();
            }
        }
    }
    private function connect(): static {
        $this->init($this->baseUrl().'api/rest/');
        return $this;
    }
    public function baseUrl(): ?string {
        $url = $this->env('URL');
        return $url ? rtrim($url, '/').'/' : null;
    }
    public function checkCredentials(): bool {
        return $this->checkResponse(fn () => $this->me());
    }
    protected function getToken(): string {
        return $this->env('TOKEN') ?? '';
    }
    protected function getHeaders(): array {
        return ['Content-Type' => 'application/json', 'Authorization' => $this->getToken()];
    }
    private function read(string $path, array $query = []): ?array {
        return $this->curl('get', $path, ['query' => $query]);
    }
    public function me(): ?array {
        return $this->read('users/me');
    }
    public function issueUrl(int $issueId): string {
        return $this->baseUrl().'view.php?id='.$issueId;
    }
    public function projectIdFromLink(string $url): ?int {
        if (! str_starts_with($url, (string)$this->baseUrl())) {
            return null;
        }
        return preg_match('#projects/(\d+)/?$#', $url, $match) ? (int)$match[1] : null;
    }

    /** @return list<array<string, mixed>> */
    public function issuesUpdatedSince(int $projectId, CarbonInterface $since): array {
        $issues = [];
        for ($page = 1; $page <= self::MAX_PAGES; $page++) {
            $batch = $this->read('issues', ['project_id' => $projectId, 'page_size' => self::PAGE_SIZE, 'page' => $page])['issues'] ?? [];
            $fresh = array_filter($batch, fn (array $issue) => Carbon::parse($issue['updated_at'] ?? $issue['created_at'])->gt($since));
            array_push($issues, ...$fresh);
            if (count($batch) < self::PAGE_SIZE || count($fresh) < count($batch)) {
                break;
            }
        }
        return $issues;
    }
}
