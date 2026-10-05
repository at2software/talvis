<?php

namespace App\Models;

use App\Http\Controllers\PluginGitController;
use App\Support\PipelineJobKind;
use Cron\CronExpression;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

class GitlabAuditProject extends Model {
    const RETRYABLE_KINDS        = ['vuln', 'npm-audit', 'composer-audit', 'cargo-audit', 'sast'];
    const STATUS_RETRIED         = 'retried';
    const STATUS_NO_DEPLOYMENT   = 'no-deployment';
    const STATUS_NO_JOBS         = 'no-jobs';
    const STATUS_FOREIGN_GITLAB  = 'foreign-gitlab';
    const UNFINISHED_JOB_STATES  = ['created', 'waiting_for_resource', 'preparing', 'pending', 'running', 'scheduled'];

    protected $fillable = ['gitlab_url', 'namespace_with_path', 'project_name', 'gitlab_project_id', 'company_id', 'invoice_item_id', 'environment', 'cron', 'jobs'];
    protected $casts    = [
        'jobs'        => 'array',
        'last_run_at' => 'datetime',
    ];

    public function company() {
        return $this->belongsTo(Company::class);
    }
    public function invoiceItem() {
        return $this->belongsTo(InvoiceItem::class);
    }
    public static function isRetryableJob(string $jobName): bool {
        return in_array(PipelineJobKind::of($jobName), self::RETRYABLE_KINDS, true);
    }
    public function isDue(?Carbon $now = null): bool {
        if (! $this->cron || ! CronExpression::isValidExpression($this->cron)) {
            return false;
        }
        $previousRun = Carbon::instance((new CronExpression($this->cron))->getPreviousRunDate($now ?? now(), 0, true));
        return ! $this->last_run_at || $this->last_run_at->lt($previousRun);
    }

    /**
     * @return array{deployment: ?array, jobs: list<array>}
     */
    public function deploymentJobs(PluginGitController $git): array {
        if (! $this->isOnInstanceOf($git)) {
            return ['deployment' => null, 'jobs' => []];
        }
        $deployment = $git->getLatestDeployment($this->gitlab_project_id, $this->environment);
        $pipelineId = $deployment['deployable']['pipeline']['id'] ?? null;
        $jobs       = $pipelineId ? $git->getPipelineJobs($this->gitlab_project_id, $pipelineId) ?? [] : [];
        return [
            'deployment' => $deployment,
            'jobs'       => array_values(array_filter($jobs, fn (array $job) => self::isRetryableJob($job['name']))),
        ];
    }

    public function runAudit(PluginGitController $git): void {
        if (! $this->isOnInstanceOf($git)) {
            $this->recordRun(self::STATUS_FOREIGN_GITLAB);
            return;
        }
        ['deployment' => $deployment, 'jobs' => $jobs] = $this->deploymentJobs($git);
        if (! $deployment) {
            $this->recordRun(self::STATUS_NO_DEPLOYMENT);
            return;
        }
        $pipelineId = $deployment['deployable']['pipeline']['id'];
        $retried    = collect($jobs)
            ->filter(fn (array $job) => in_array($job['name'], $this->jobs ?? [], true))
            ->reject(fn (array $job) => in_array($job['status'], self::UNFINISHED_JOB_STATES, true))
            ->filter(fn (array $job) => $git->retryJob($this->gitlab_project_id, $job['id']) !== null);
        $this->recordRun($retried->isEmpty() ? self::STATUS_NO_JOBS : self::STATUS_RETRIED, $pipelineId);
    }
    private function isOnInstanceOf(PluginGitController $git): bool {
        return $this->gitlab_project_id && $git->env('URL') && str_starts_with($this->gitlab_url, $git->env('URL'));
    }
    private function recordRun(string $status, ?int $pipelineId = null): void {
        $this->forceFill([
            'last_run_at'      => now(),
            'last_status'      => $status,
            'last_pipeline_id' => $pipelineId ?? $this->last_pipeline_id,
        ])->save();
    }
}
