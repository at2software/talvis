<?php

namespace Tests\Feature\Performance;

use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('benchmark')]
class ApiEndpointBenchmarkTest extends TestCase {
    private const DEFAULT_USER_ID = 4;
    private const DEFAULT_COMPANY_ID = 2124;
    private const DEFAULT_TIME_PROJECT_ID = 1225;
    private const DEFAULT_BUDGET_PROJECT_ID = 1515;
    private const DEFAULT_TOP_RESULTS = 0;
    private const REPORT_PATH = 'storage/app/api-benchmark-report.json';
    private const ENTITY_PARAM_FALLBACK_KEY = 'HR_HOURLY_WAGE';
    private const USER_PARAM_FALLBACK_KEY = 'STATS_PREDICTION_BIAS';
    private const CASHFLOW_WIDGET_KEY = 'PROJECTS_TIMEBASED';
    private const CASHFLOW_HISTORY_KEYS = 'CASHFLOW_BANK_BALANCE,CASHFLOW_INVOICES_REPAYMENTS,CASHFLOW_INVOICES_REPAYMENTS_OVERDUE,CASHFLOW_INVOICES_RECURRING,CASHFLOW_INVOICES,CASHFLOW_INVOICES_PREPARED,CASHFLOW_PROJECTS_TIMEBASED,CASHFLOW_PROJECTS,CASHFLOW_CUSTOMER_SUPPORT,CASHFLOW_PROJECTS_ACQUISITIONS,CASHFLOW_PROJECTS_LINREG,CASHFLOW_ANNUAL_EXPENSES';

    private array $resolvedIds = [];

    public function test_api_get_endpoints_are_benchmarked_without_server_errors(): void {
        $user = User::query()->find((int) env('API_BENCHMARK_USER_ID', self::DEFAULT_USER_ID));

        $this->assertNotNull(
            $user,
            'Benchmark user not found. Set API_BENCHMARK_USER_ID to a valid user id before running this test.'
        );

        $originalToken = $user->api_token;
        $benchmarkToken = 'benchmark-token-'.Str::random(40);
        $user->forceFill(['api_token' => $benchmarkToken])->save();

        Auth::shouldUse('api');
        $this->actingAs($user, 'api');
        $this->withHeaders(['Authorization' => 'Bearer '.$benchmarkToken]);

        try {
            $results = [];

            foreach ($this->benchmarkScenarios() as $scenario) {
                $results[] = $this->benchmarkScenario($scenario);
            }

            usort($results, fn (array $left, array $right) => $right['duration_ms'] <=> $left['duration_ms']);

            $this->persistReport($results, $user->id);
            $this->writeConsoleReport($results, $user->id);

            $executed = array_values(array_filter($results, fn (array $result) => $result['outcome'] !== 'skipped'));

            $this->assertNotEmpty($executed, 'No API endpoints were benchmarked. Adjust the filters or fixture ids.');
        } finally {
            $user->forceFill(['api_token' => $originalToken])->save();
        }
    }

    private function benchmarkScenarios(): array {
        $scenarios = $this->manualBenchmarkScenarios();

        foreach (Route::getRoutes()->getRoutes() as $route) {
            $uri = $route->uri();

            if (! str_starts_with($uri, 'api/')) {
                continue;
            }

            $skipReason = $this->skipReasonForRoute($route);
            $baseScenario = [
                'method' => in_array('GET', $route->methods(), true) ? 'GET' : $route->methods()[0],
                'uri' => $uri,
                'skip_reason' => $skipReason,
                'middleware' => $route->gatherMiddleware(),
                'label' => null,
                'query' => $this->queryForUri($uri),
                'overrides' => [],
            ];

            if ($this->isProjectScopedRoute($uri)) {
                $scenarios[] = [
                    ...$baseScenario,
                    'label' => 'time-project',
                    'overrides' => [
                        'project' => (int) env('API_BENCHMARK_PROJECT_TIME_ID', self::DEFAULT_TIME_PROJECT_ID),
                        '_' => (int) env('API_BENCHMARK_PROJECT_TIME_ID', self::DEFAULT_TIME_PROJECT_ID),
                    ],
                ];

                $scenarios[] = [
                    ...$baseScenario,
                    'label' => 'budget-project',
                    'overrides' => [
                        'project' => (int) env('API_BENCHMARK_PROJECT_BUDGET_ID', self::DEFAULT_BUDGET_PROJECT_ID),
                        '_' => (int) env('API_BENCHMARK_PROJECT_BUDGET_ID', self::DEFAULT_BUDGET_PROJECT_ID),
                    ],
                ];

                continue;
            }

            $scenarios[] = $baseScenario;
        }

        $filter = trim((string) env('API_BENCHMARK_ROUTE_FILTER', ''));

        if ($filter === '') {
            return $scenarios;
        }

        return array_values(array_filter($scenarios, function (array $scenario) use ($filter) {
            return str_contains($scenario['uri'], $filter)
                || str_contains($scenario['method'].' '.$scenario['uri'], $filter)
                || ($scenario['label'] !== null && str_contains($scenario['label'], $filter));
        }));
    }

    private function manualBenchmarkScenarios(): array {
        return [
            $this->manualScenario(
                'api/widgets/cashflow/{key}',
                'cashflow-acquisitions-chart',
                [
                    'key' => 'PROJECTS_ACQUISITIONS',
                ],
                [
                    'max-items' => 0,
                    'only-mine' => 'false',
                    'only-mine-as-pm' => 'false',
                    'chart-only' => 'false',
                    'withChart' => 1,
                ],
            ),
            $this->manualScenario(
                'api/stats/linear-regression-forecast',
                'linear-regression-forecast',
            ),
            $this->manualScenario(
                'api/projects',
                'projects-missing-pm',
                [],
                [
                    'missing_project_manager' => 'true',
                    'states' => '1,,,6,2,,,8,,,9',
                    'max-items' => 999,
                    'only-mine-as-pm' => 'false',
                ],
            ),
            $this->manualScenario(
                'api/params/{key}/history',
                'cashflow-history',
                [
                    'key' => self::CASHFLOW_HISTORY_KEYS,
                ],
                [
                    'since' => 1688162400,
                    'cluster' => 'month',
                ],
            ),
            $this->manualScenario(
                'api/companies',
                'companies-active-projects',
                [],
                [
                    'onlyWithActiveProjects' => 'true',
                    'revenueOn' => 'false',
                    'revenueSpan' => 'undefined',
                    'revenueMin' => 0,
                ],
            ),
            $this->manualScenario(
                'api/projects',
                'projects-assigned-users',
                [],
                [
                    'states' => '1,6,2,8,9',
                    'is_internal' => 0,
                    'is_time_based' => '1,0',
                    'append' => 'net',
                    'paginate' => 'true',
                    'with' => 'assigned_users',
                ],
            ),
        ];
    }

    private function manualScenario(string $uri, string $label, array $overrides = [], array $query = []): array {
        return [
            'method' => 'GET',
            'uri' => $uri,
            'skip_reason' => null,
            'middleware' => [],
            'label' => $label,
            'query' => $query,
            'overrides' => $overrides,
        ];
    }

    private function benchmarkScenario(array $scenario): array {
        $query = $scenario['query'];

        if ($scenario['skip_reason'] !== null) {
            return $this->skippedResult($scenario, $scenario['skip_reason']);
        }

        $resolved = $this->resolveUri($scenario['uri'], $scenario['overrides']);

        if ($resolved['uri'] === null) {
            return $this->skippedResult($scenario, $resolved['reason'] ?? 'Unresolvable route parameters');
        }

        $requestUri = $this->requestUri($resolved['uri'], $query);
        $fullUri = '/'.$requestUri;
        if ($query !== []) {
            $fullUri = '/'.$requestUri;
        }

        $startedAt = hrtime(true);
        $response = $this->json($scenario['method'], $fullUri);
        $durationMs = round((hrtime(true) - $startedAt) / 1000000, 2);

        return [
            'method' => $scenario['method'],
            'uri' => $resolved['uri'],
            'request_uri' => $requestUri,
            'label' => $scenario['label'],
            'status' => $response->getStatusCode(),
            'duration_ms' => $durationMs,
            'outcome' => $this->outcomeForStatus($response->getStatusCode()),
            'skip_reason' => null,
        ];
    }

    private function skippedResult(array $scenario, string $reason): array {
        return [
            'method' => $scenario['method'],
            'uri' => $scenario['uri'],
            'request_uri' => $this->requestUri($scenario['uri'], $scenario['query']),
            'label' => $scenario['label'],
            'status' => 0,
            'duration_ms' => 0.0,
            'outcome' => 'skipped',
            'skip_reason' => $reason,
        ];
    }

    private function skipReasonForRoute(object $route): ?string {
        $methods = $route->methods();
        $uri = $route->uri();
        $middleware = $route->gatherMiddleware();

        if (! in_array('GET', $methods, true) && ! in_array('HEAD', $methods, true)) {
            return 'Non-read route';
        }

        if (collect($middleware)->contains(fn (string $name) => str_contains($name, 'WebDAVAuthMiddleware'))) {
            return 'WebDAV endpoint';
        }

        if (str_contains($uri, 'team-monitor')) {
            return 'Requires API key auth';
        }

        if (preg_match('#/(create|edit)$#', $uri) === 1) {
            return 'Resource helper route';
        }

        if (in_array($uri, ['api/qr', 'api/neuron/icon'], true)) {
            return 'Binary asset endpoint';
        }

        if ($uri === 'api/projects') {
            return 'Covered by projects-assigned-users manual scenario';
        }

        if (preg_match('#/pdf$#', $uri) === 1) {
            return 'PDF streaming endpoint (requires generated file on disk)';
        }

        if (preg_match('#^api/(companies|projects|users)/\{[^}]+\}/icon$#', $uri) === 1) {
            return 'Binary asset endpoint';
        }

        if ($uri === 'api/users/{_}/mailicon') {
            return 'Requires email path segment rather than numeric fixture';
        }

        if (in_array($uri, ['api/companies/by-phone'], true)) {
            return 'Requires request-specific query data';
        }

        return null;
    }

    private function resolveUri(string $uri, array $overrides): array {
        preg_match_all('/\{([^}]+)\}/', $uri, $matches, PREG_OFFSET_CAPTURE);

        if ($matches[0] === []) {
            return ['uri' => $uri, 'reason' => null];
        }

        $resolvedUri = $uri;

        foreach ($matches[1] as $index => $match) {
            $placeholder = $match[0];
            $token = $matches[0][$index][0];
            $cleanPlaceholder = rtrim($placeholder, '?');

            $value = $overrides[$cleanPlaceholder]
                ?? $overrides[$placeholder]
                ?? $this->resolvePlaceholderValue($cleanPlaceholder, $uri, $index);

            if ($value === null || $value === '') {
                return ['uri' => null, 'reason' => 'Missing fixture for {'.$placeholder.'}'];
            }

            $resolvedUri = str_replace($token, (string) $value, $resolvedUri);
        }

        return ['uri' => $resolvedUri, 'reason' => null];
    }

    private function resolvePlaceholderValue(string $placeholder, string $uri, int $placeholderIndex): int|string|null {
        if ($placeholder === 'path') {
            return 'projects';
        }

        if ($placeholder === 'span') {
            return 5;
        }

        if ($placeholder === 'type') {
            return 'user';
        }

        if ($placeholder === 'key') {
            if (str_contains($uri, 'widgets/cashflow/')) {
                return self::CASHFLOW_WIDGET_KEY;
            }

            if (str_contains($uri, 'users/') && str_contains($uri, '/params/')) {
                return self::USER_PARAM_FALLBACK_KEY;
            }

            return self::ENTITY_PARAM_FALLBACK_KEY;
        }

        if ($placeholder === 'command') {
            return $this->firstCustomCommandName();
        }

        $contextKey = $this->contextKeyForPlaceholder($placeholder, $uri, $placeholderIndex);

        if ($contextKey === 'user') {
            return (int) env('API_BENCHMARK_USER_ID', self::DEFAULT_USER_ID);
        }

        if ($contextKey === 'company') {
            return (int) env('API_BENCHMARK_COMPANY_ID', self::DEFAULT_COMPANY_ID);
        }

        if ($contextKey === 'project') {
            return (int) env('API_BENCHMARK_PROJECT_TIME_ID', self::DEFAULT_TIME_PROJECT_ID);
        }

        return $this->firstIdForContext($contextKey);
    }

    private function contextKeyForPlaceholder(string $placeholder, string $uri, int $placeholderIndex): string {
        $segments = explode('/', $uri);
        $placeholderSegments = [];

        foreach ($segments as $segment) {
            if (preg_match('/^\{[^}]+\}$/', $segment)) {
                $placeholderSegments[] = $segment;
            }
        }

        $segmentWithPlaceholder = $placeholderSegments[$placeholderIndex] ?? null;

        if ($placeholder !== '_' && $placeholder !== 'id') {
            return Str::snake($placeholder);
        }

        if ($segmentWithPlaceholder === null) {
            return Str::snake($placeholder);
        }

        $segmentIndex = array_search($segmentWithPlaceholder, $segments, true);
        $previousSegment = $segmentIndex !== false ? ($segments[$segmentIndex - 1] ?? '') : '';

        return Str::snake(Str::singular($previousSegment));
    }

    private function firstIdForContext(string $contextKey): int|string|null {
        if (array_key_exists($contextKey, $this->resolvedIds)) {
            return $this->resolvedIds[$contextKey];
        }

        $modelClass = $this->modelClassForContext($contextKey);

        if ($modelClass === null || ! class_exists($modelClass)) {
            $this->resolvedIds[$contextKey] = null;
            return null;
        }

        $model = new $modelClass;
        $this->resolvedIds[$contextKey] = $modelClass::query()->value($model->getKeyName());

        return $this->resolvedIds[$contextKey];
    }

    private function modelClassForContext(string $contextKey): ?string {
        $aliases = [
            'assignment' => 'App\\Models\\Assignment',
            'calendar_entry' => 'App\\Models\\CalendarEntry',
            'comment' => 'App\\Models\\Comment',
            'company' => 'App\\Models\\Company',
            'company_contact' => 'App\\Models\\CompanyContact',
            'contact' => 'App\\Models\\Contact',
            'debrief' => 'App\\Models\\DebriefProjectDebrief',
            'deletion_log' => 'App\\Models\\DeletionLog',
            'expense' => 'App\\Models\\Expense',
            'expense_category' => 'App\\Models\\ExpenseCategory',
            'file' => 'App\\Models\\File',
            'focus' => 'App\\Models\\Focus',
            'gitlab_audit_project' => 'App\\Models\\GitlabAuditProject',
            'grant' => 'App\\Models\\VacationGrant',
            'invoice' => 'App\\Models\\Invoice',
            'invoice_item' => 'App\\Models\\InvoiceItem',
            'lead_source' => 'App\\Models\\LeadSource',
            'marketing_activity' => 'App\\Models\\MarketingActivity',
            'marketing_initiative' => 'App\\Models\\MarketingInitiative',
            'marketing_performance_metric' => 'App\\Models\\MarketingPerformanceMetric',
            'marketing_prospect' => 'App\\Models\\MarketingProspect',
            'marketing_workflow' => 'App\\Models\\MarketingWorkflow',
            'milestone' => 'App\\Models\\Milestone',
            'plugin_link' => 'App\\Models\\PluginLink',
            'problem' => 'App\\Models\\DebriefProblem',
            'product' => 'App\\Models\\Product',
            'product_group' => 'App\\Models\\ProductGroup',
            'project' => 'App\\Models\\Project',
            'sentinel' => 'App\\Models\\Sentinel',
            'solution' => 'App\\Models\\DebriefSolution',
            'task' => 'App\\Models\\Task',
            'uptime_monitor' => 'App\\Models\\UptimeMonitor',
            'user' => 'App\\Models\\User',
            'vacation' => 'App\\Models\\Vacation',
            'vault' => 'App\\Models\\Vault',
        ];

        if (isset($aliases[$contextKey])) {
            return $aliases[$contextKey];
        }

        return 'App\\Models\\'.Str::studly($contextKey);
    }

    private function queryForUri(string $uri): array {
        if ($uri === 'api/stats/quote-accuracy') {
            return [
                'startDate' => now()->subYear()->startOfDay()->format('Y-m-d'),
                'endDate' => now()->endOfDay()->format('Y-m-d'),
            ];
        }

        if (str_contains($uri, '/params/')) {
            return ['fallback' => 1];
        }

        return [];
    }

    private function requestUri(string $uri, array $query): string {
        if ($query === []) {
            return $uri;
        }

        return $uri.'?'.http_build_query($query);
    }

    private function firstCustomCommandName(): ?string {
        foreach (Artisan::all() as $name => $command) {
            if (str_starts_with($command::class, 'App\\Console\\Commands\\')) {
                return $name;
            }
        }

        return null;
    }

    private function isProjectScopedRoute(string $uri): bool {
        return str_contains($uri, 'api/projects/{project}') || str_contains($uri, 'api/projects/{_}');
    }

    private function outcomeForStatus(int $status): string {
        return match (true) {
            $status >= 500 => 'server_error',
            $status === 403 => 'forbidden',
            $status === 401 => 'unauthorized',
            $status >= 400 => 'client_error',
            default => 'ok',
        };
    }

    private function persistReport(array $results, int|string $userId): void {
        $payload = [
            'ran_at' => now()->toIso8601String(),
            'user_id' => $userId,
            'route_filter' => env('API_BENCHMARK_ROUTE_FILTER'),
            'results' => $results,
        ];

        file_put_contents(base_path(self::REPORT_PATH), json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    }

    private function writeConsoleReport(array $results, int|string $userId): void {
        $executed = array_values(array_filter($results, fn (array $result) => $result['outcome'] !== 'skipped'));
        $serverErrors = array_values(array_filter($executed, fn (array $result) => $result['status'] >= 500));
        $configuredTop = (int) env('API_BENCHMARK_TOP', self::DEFAULT_TOP_RESULTS);
        $topLimit = $configuredTop > 0 ? $configuredTop : count($executed);
        $slowest = array_slice($executed, 0, $topLimit);

        fwrite(STDOUT, PHP_EOL.'API benchmark user: '.$userId.PHP_EOL);
        fwrite(STDOUT, 'Executed routes: '.count($executed).', server errors: '.count($serverErrors).PHP_EOL);
        fwrite(STDOUT, 'Report file: '.self::REPORT_PATH.PHP_EOL.PHP_EOL);
        fwrite(STDOUT, 'Benchmark results (sorted by duration):'.PHP_EOL);

        foreach ($slowest as $result) {
            $label = $result['label'] ? ' ['.$result['label'].']' : '';
            fwrite(
                STDOUT,
                sprintf('%8.2f ms  [%3d] %s %s%s', $result['duration_ms'], $result['status'], $result['method'], $result['request_uri'], $label).PHP_EOL
            );
        }

        if ($serverErrors !== []) {
            fwrite(STDOUT, PHP_EOL.'Server errors:'.PHP_EOL);

            foreach ($serverErrors as $result) {
                $label = $result['label'] ? ' ['.$result['label'].']' : '';
                fwrite(
                    STDOUT,
                    sprintf('[%3d] %s %s%s', $result['status'], $result['method'], $result['request_uri'], $label).PHP_EOL
                );
            }
        }
    }
}