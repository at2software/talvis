<?php

namespace App\Http\Controllers;

use App\Jobs\GitBuildWebhookJob;
use App\Jobs\GitIssueWebhookJob;
use App\Jobs\GitNoteWebhookJob;
use App\Jobs\GitPipelineWebhookJob;
use App\Jobs\GitPushWebhookJob;
use App\Models\PluginLink;
use App\Services\FrameworkDetectionService;
use App\Support\ChatProps;
use App\Traits\HasVaultCredentials;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

class PluginGitController extends PluginController {
    use HasVaultCredentials;

    public static function getKey(): string {
        return 'gitlab';
    }
    public function vaultPrefix(): string {
        return 'GITLAB';
    }
    public function checkCredentials(): bool {
        return $this->checkResponse(fn () => $this->showUser());
    }
    public function __construct($credentials = null) {
        $this->credentials = $credentials;

        try {
            if (! $credentials && DB::connection()->getDatabaseName()) {
                $this->credentials = $this->getCredentials();
            }
        } catch (\Throwable $e) {
        }

        if (! $credentials) {
            $this->middleware('apikey:X-Gitlab-Token,'.$this->env('APIKEY'));
            $this->middleware('has_plugin:GITLAB_URL');
        }
        if ($this->env('URL')) {
            $this->init('');
        } else {
            return null;
        }
    }
    protected function getToken(): string {
        return $this->env('TOKEN');
    }
    public function props($name = 'GitLab Webhook') {
        return ChatProps::sender($name, asset('icons/icon.git.big.png'));
    }
    // ############ Incoming

    public function getJobArtifact(int $projectId, int $jobId, string $artifactPath): ?array {
        $url = $this->env('URL').'api/v4/projects/'.$projectId.'/jobs/'.$jobId.'/artifacts/'.$artifactPath;
        return $this->get($url);
    }
    public function getPipeline(int $projectId, int $pipelineId): ?array {
        $url = $this->env('URL').'api/v4/projects/'.$projectId.'/pipelines/'.$pipelineId;
        return $this->get($url);
    }
    public function getPipelineJobs(int $projectId, int $pipelineId): ?array {
        $url = $this->env('URL').'api/v4/projects/'.$projectId.'/pipelines/'.$pipelineId.'/jobs?per_page=100';
        return $this->get($url);
    }
    public function getProject(string $pathWithNamespace): ?array {
        $url = $this->env('URL').'api/v4/projects/'.urlencode($pathWithNamespace);
        return $this->get($url);
    }
    public function getEnvironments(int $projectId): ?array {
        $url = $this->env('URL').'api/v4/projects/'.$projectId.'/environments?states=available&per_page=100';
        return $this->get($url);
    }
    public function getLatestDeployment(int $projectId, string $environment): ?array {
        $query = http_build_query(['environment' => $environment, 'status' => 'success', 'order_by' => 'id', 'sort' => 'desc', 'per_page' => 1]);
        $url   = $this->env('URL').'api/v4/projects/'.$projectId.'/deployments?'.$query;
        return $this->get($url)[0] ?? null;
    }
    public function retryJob(int $projectId, int $jobId): ?array {
        $url = $this->env('URL').'api/v4/projects/'.$projectId.'/jobs/'.$jobId.'/retry';
        return $this->post($url);
    }
    public function downloadTest() {
        $projectId = null; // Configure with your GitLab project ID
        $jobId     = null; // Configure with your GitLab job ID
        if (! $projectId || ! $jobId) {
            return;
        }
        $baseUrl  = $this->env('URL').'api/v4/projects/'.$projectId;
        $sastData = $this->get("$baseUrl/jobs/$jobId");
        $sastKey  = PluginLink::arrayFindKey($sastData['artifacts'] ?? [], fn ($_) => $_['file_type'] === 'sast');
        if ($sastKey !== -1) {
            $sastFile = $this->get("$baseUrl/jobs/$jobId/artifacts/download?file_type=sast");
        }
    }
    public function onWebhook(Request $data): Response {
        $data->validate(['object_kind' => 'required|string']);
        $projectUrl = PluginLink::buildApiPathFromProject($data->project);
        $links      = PluginLink::where('url', $projectUrl)->with('parent')->get();

        switch ($data->object_kind) {
            case 'build':
                GitBuildWebhookJob::dispatch($links, $data->project, $data->all(), $this->credentials ?? []);
                break;
            case 'pipeline':
                GitPipelineWebhookJob::dispatch($links, $data->project, $data->object_attributes, $data->builds);
                break;
            case 'issue':
                GitIssueWebhookJob::dispatch($links, $data->project, $data->object_attributes, $data->user, $data->assignees ?? [], $data->changes ?? []);
                break;
            case 'note':
                GitNoteWebhookJob::dispatch($links, $data->project, $data->issue, $data->object_attributes, $data->user);
                break;
            case 'push':
                GitPushWebhookJob::dispatch($links, $data->project, $this->credentials);
                break;
            default:
                break;
        }
        // $localai = app(PluginLocalAIController::class);
        // if($localai) $localai->onWebhook($data);
        return response()->noContent();
    }

    // ########### Outgoing

    public function showUser() {
        $url      = $this->env('URL').'api/v4/user';
        $response = $this->get($url);
        return $response;
    }
    public function indexWebhooks(PluginLink $link) {
        return $this->get($link->buildApiPath().'/hooks');
    }
    public function deleteWebhook(PluginLink $link, $id) {
        return $this->delete($link->buildApiPath().'/hooks/'.$id);
    }
    public function storeWebhook(PluginLink $link) {
        return $this->post($link->buildApiPath().'/hooks', [
            'url'               => config('app.api_url').'gitlab',
            'token'             => $this->env('APIKEY'),
            'name'              => 'TALVIS',
            'description'       => 'TALVIS Webhook',
            'deployment_events' => true,
            'issues_events'     => true,
            'job_events'        => true,
            'note_events'       => true,
            'pipeline_events'   => true,
        ]);
    }
    public function getCommitDiff($projectId, $commitId): string {
        $url = $this->env('URL')."/v4/projects/{$projectId}/repository/commits/{$commitId}/diff";
        return json_encode($this->get($url), JSON_PRETTY_PRINT);
    }
    public function getFileContent(PluginLink $link, string $filePath): ?string {
        try {
            $url      = $link->buildApiPath().'/repository/files/'.urlencode($filePath).'/raw';
            $payload  = ['headers' => $this->getHeaders()];
            $response = $this->client->get($url, $payload);
            return $response->getBody()->getContents();
        } catch (\Exception $e) {
            return null;
        }
    }
    public function getRepositoryTree(PluginLink $link, string $path = '', bool $recursive = false): ?array {
        try {
            $url    = $link->buildApiPath().'/repository/tree';
            $params = ['path' => $path];
            if ($recursive) {
                $params['recursive'] = 'true';
            }
            $payload = [
                'headers' => $this->getHeaders(),
                'query'   => $params,
            ];
            $response = $this->client->get($url, $payload);
            return json_decode($response->getBody()->getContents(), true);
        } catch (\Exception $e) {
            return null;
        }
    }
    public function detectFramework(PluginLink $link): array {
        return (new FrameworkDetectionService)->detect($this, $link);
    }
}
