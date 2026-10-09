<?php

namespace App\Http\Controllers;

use App\Models\GitlabAuditProject;
use App\Models\PluginLink;
use App\Models\Project;
use Closure;
use Cron\CronExpression;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class GitlabAuditController extends Controller {
    public function index() {
        $auditProjects = GitlabAuditProject::with('company', 'invoiceItem')->get();
        foreach ($auditProjects as $ap) {
            $ap->linked_projects = $this->linkedProjects($ap);
        }
        return $auditProjects;
    }
    private function linkedProjects(GitlabAuditProject $ap): array {
        if (! $ap->gitlab_project_id) {
            return [];
        }
        $gitUrl = $ap->gitlab_url.'projects/'.$ap->gitlab_project_id;
        return PluginLink::where('type', 'git')
            ->where('url', $gitUrl)
            ->where('parent_type', Project::class)
            ->get()
            ->map(function ($link) {
                $project = Project::find($link->parent_id);
                if (! $project) {
                    return null;
                }
                $hasChat = $project->pluginLinks()
                    ->whereIn('type', ['mattermost', 'slack'])
                    ->exists();
                return [
                    'id'       => $project->id,
                    'name'     => $project->name,
                    'has_chat' => $hasChat,
                ];
            })
            ->filter()
            ->values()
            ->toArray();
    }
    public function store(Request $request) {
        $data = $request->validate([
            'gitlab_url'          => 'required|string',
            'namespace_with_path' => 'required|string',
            'project_name'        => 'required|string',
            'gitlab_project_id'   => 'required|integer',
            'company_id'          => 'nullable|exists:companies,id,deleted_at,NULL',
            'invoice_item_id'     => 'nullable|exists:invoice_items,id,deleted_at,NULL',
            ...$this->scheduleRules(),
        ]);
        return GitlabAuditProject::updateOrCreate(
            ['gitlab_url' => $data['gitlab_url'], 'namespace_with_path' => $data['namespace_with_path']],
            $data
        );
    }
    public function candidates(Request $request, PluginGitController $git) {
        $data = $request->validate([
            'url'         => 'required|url',
            'environment' => 'nullable|string',
        ]);
        $gitlabUrl = $git->env('URL');
        if (! $gitlabUrl || ! str_starts_with($data['url'], $gitlabUrl)) {
            abort(422, 'The GitLab vault connector does not cover this URL');
        }
        $project = $git->getProject(trim(substr($data['url'], strlen($gitlabUrl)), '/'));
        if (! $project) {
            abort(404, 'Project not found or the GitLab vault connector has no access');
        }
        $environments = array_column($git->getEnvironments($project['id']) ?? [], 'name');
        $environment  = $data['environment'] ?? (in_array('production', $environments, true) ? 'production' : ($environments[0] ?? 'production'));
        $audit        = new GitlabAuditProject(['gitlab_url' => $gitlabUrl, 'gitlab_project_id' => $project['id'], 'environment' => $environment]);
        return [
            'gitlab_url'   => $gitlabUrl,
            'project'      => Arr::only($project, ['id', 'name', 'path_with_namespace']),
            'environments' => $environments,
            'environment'  => $environment,
            ...$audit->deploymentJobs($git),
        ];
    }
    public function run(GitlabAuditProject $gitlabAuditProject, PluginGitController $git) {
        $gitlabAuditProject->runAudit($git);
        return $gitlabAuditProject->load('company', 'invoiceItem');
    }
    public function update(Request $request, GitlabAuditProject $gitlabAuditProject) {
        $data = $request->validate([
            'project_name'    => 'sometimes|string',
            'company_id'      => 'nullable|exists:companies,id,deleted_at,NULL',
            'invoice_item_id' => 'nullable|exists:invoice_items,id,deleted_at,NULL',
            ...array_map(fn (array $rules) => ['sometimes', ...$rules], $this->scheduleRules()),
        ]);
        $gitlabAuditProject->update($data);
        return $gitlabAuditProject->load('company', 'invoiceItem');
    }
    public function destroy(GitlabAuditProject $gitlabAuditProject) {
        $gitlabAuditProject->delete();
        return response()->noContent();
    }
    private function scheduleRules(): array {
        return [
            'environment' => ['required', 'string'],
            'cron'        => ['required', 'string', function (string $attribute, mixed $value, Closure $fail) {
                if (! CronExpression::isValidExpression($value)) {
                    $fail('invalid cron expression');
                }
            }],
            'jobs'   => ['required', 'array', 'min:1'],
            'jobs.*' => ['string', function (string $attribute, mixed $value, Closure $fail) {
                if (! GitlabAuditProject::isRetryableJob($value)) {
                    $fail("'$value' is not an audit job");
                }
            }],
        ];
    }
}
