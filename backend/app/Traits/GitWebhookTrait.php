<?php

namespace App\Traits;

use App\Http\Controllers\PluginChatController;
use App\Http\Controllers\PluginGitController;
use App\Jobs\ChatSendMessageJob;
use App\Models\Param;
use App\Models\Project;
use App\Support\ChatProps;
use App\Support\PipelineJobKind;

trait GitWebhookTrait {
    private function pipelineJobs(): array {
        $raw = Param::get('SETTINGS_GIT_PIPELINE')?->value;
        if ($raw) {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return [
            ['job' => 'semgrep-sast',   'artifact' => 'gl-sast-report.json', 'type' => 'sast'],
            ['job' => 'npm-audit',      'artifact' => 'npm-audit.json',       'type' => 'npm'],
            ['job' => 'composer audit', 'artifact' => 'composer-audit.json',  'type' => 'composer'],
            ['job' => 'cargo audit',    'artifact' => 'cargo-audit.json',     'type' => 'cargo'],
            ['job' => 'vuln_scan',      'artifact' => 'grype-report.json',    'type' => 'grype'],
        ];
    }
    private function dispatchSecurityReport(string $jobName, int $jobId, array $props): void {
        $jobMap    = collect($this->pipelineJobs())->keyBy('job');
        $jobConfig = $jobMap->get($jobName);
        if (! $jobConfig) {
            return;
        }

        $controller = new PluginGitController($this->credentials);
        $data       = $controller->getJobArtifact($this->project['id'], $jobId, $jobConfig['artifact']);
        if (! $data) {
            return;
        }

        [$securityMessage, $securityProps] = match ($jobConfig['type']) {
            'sast'     => [$this->formatSast($data),          $this->securityProps($this->project['name'], 'SAST', 'job-sast.png')],
            'npm'      => [$this->formatNpmAudit($data),      $this->securityProps($this->project['name'], 'NPM', 'job-npm-audit.png')],
            'composer' => [$this->formatComposerAudit($data), $this->securityProps($this->project['name'], 'Composer', 'job-composer-audit.png')],
            'cargo'    => [$this->formatCargoAudit($data),    $this->securityProps($this->project['name'], 'Cargo', 'job-cargo-audit.png')],
            'grype'    => [$this->formatGrype($data),         $this->securityProps($this->project['name'], 'Grype', 'job-vuln.png')],
            default    => [null, null],
        };

        if (! $securityMessage) {
            return;
        }

        $cacheId = 'git_security_'.$jobName.'_'.$jobId;

        foreach ($this->links->siblingsOfType(PluginChatController::class) as $chatInfo) {
            ChatSendMessageJob::dispatch($securityMessage, $securityProps, channelId: $chatInfo['channelId'], cacheId: $cacheId, chatKey: $chatInfo['controller']::getKey());
        }
    }
    private function notifyProjectManager(string $message, ?string $cacheId = null): void {
        foreach ($this->links as $link) {
            $project = $link->parent;
            if ($project instanceof Project && $pm = $project->projectManager) {
                ChatSendMessageJob::dispatch($message, $this->props($this->project['name']), cacheId: $cacheId, user: $pm);
                return;
            }
        }
    }
    private function formatSast(array $data): ?string {
        $vulns = $data['vulnerabilities'] ?? [];
        if (empty($vulns)) {
            return null;
        }
        $lines = [];
        foreach ($vulns as $v) {
            $sev     = $v['severity'] ?? 'Unknown';
            $name    = $v['name'] ?? 'Unknown';
            $file    = $v['location']['file'] ?? '?';
            $line    = $v['location']['start_line'] ?? '?';
            $lines[] = $this->emojiForSeverity($sev)." $name — `$file:$line`";
        }
        return implode("\n", $lines);
    }
    private function formatNpmAudit(array $data): ?string {
        $lines = [];
        foreach ($data['vulnerabilities'] ?? [] as $vuln) {
            foreach ($vuln['via'] ?? [] as $via) {
                if (! is_array($via)) {
                    continue;
                }
                $sev     = $via['severity'] ?? ($vuln['severity'] ?? 'unknown');
                $title   = $via['title'] ?? ($vuln['name'] ?? 'unknown');
                $pkg     = $vuln['name'] ?? '?';
                $lines[] = $this->emojiForSeverity(ucfirst($sev))." **$pkg** — $title";
            }
        }
        return empty($lines) ? null : implode("\n", $lines);
    }
    private function formatCargoAudit(array $data): ?string {
        $lines = [];
        foreach ($data['vulnerabilities']['list'] ?? [] as $vuln) {
            $sev     = $vuln['advisory']['severity'] ?? 'unknown';
            $title   = $vuln['advisory']['title'] ?? 'Unknown';
            $pkg     = $vuln['package']['name'] ?? '?';
            $lines[] = $this->emojiForSeverity($sev)." **$pkg** — $title";
        }
        return empty($lines) ? null : implode("\n", $lines);
    }
    private function formatComposerAudit(array $data): ?string {
        $lines = [];
        foreach ($data['advisories'] ?? [] as $package => $pkgAdvisories) {
            foreach ($pkgAdvisories as $advisory) {
                $title    = $advisory['title'] ?? 'Unknown';
                $cve      = $advisory['cve'] ? " [{$advisory['cve']}]" : '';
                $affected = $advisory['affectedVersions'] ?? '';
                $lines[]  = $this->emojiForSeverity('medium')." **$package** ($affected): $title$cve";
            }
        }
        return empty($lines) ? null : implode("\n", $lines);
    }
    private function formatGrype(array $data): ?string {
        $lines = [];
        foreach ($data['matches'] ?? [] as $match) {
            $sev     = $match['vulnerability']['severity'] ?? 'Unknown';
            $id      = $match['vulnerability']['id'] ?? 'Unknown';
            $pkg     = $match['artifact']['name'] ?? '?';
            $ver     = $match['artifact']['version'] ?? '?';
            $lines[] = $this->emojiForSeverity($sev)." **$pkg** ($ver) — $id";
        }
        return empty($lines) ? null : implode("\n", $lines);
    }
    private function emojiForSeverity(string $severity): string {
        return match (strtolower($severity)) {
            'critical'           => '🔴',
            'high'               => '🟠',
            'medium', 'warning'  => '🟡',
            default              => '🟢',
        };
    }

    /**
     * @param array<int, array{id: int, name: string, status: string, stage?: string}> $builds
     */
    private function pipelineJobList(array $builds, string $projectUrl): string {
        $stages = [];
        foreach ($builds as $build) {
            $stages[$build['stage'] ?? ''][] = $build;
        }

        foreach ($stages as &$group) {
            usort($group, fn ($a, $b) => $a['id'] <=> $b['id']);
        }
        unset($group);

        uasort($stages, fn ($a, $b) => $a[0]['id'] <=> $b[0]['id']);

        $rendered = array_map(fn ($group) => implode(' ', array_map(function (array $build) use ($projectUrl) {
            ['name' => $name, 'status' => $status] = $build;

            $url  = "{$projectUrl}/-/jobs/{$build['id']}";
            $kind = PipelineJobKind::of($name);

            if ($kind && $badge = $this->iconUrl("badges/{$this->iconStatus($status)}-$kind")) {
                $remainder = PipelineJobKind::remainder($name);
                $label     = $remainder === '' ? '' : " `$remainder`";
                return "[![$name]($badge =44x22 \"$name ($status)\")$label]($url)";
            }
            return "[{$this->statusLabel($status, $name)}]($url)";
        }, $group)), $stages);

        return implode(' · ', $rendered);
    }

    private function statusLabel(string $status, string $text): string {
        if ($statusIcon = $this->iconUrl("status-{$this->iconStatus($status)}")) {
            return "![$status]($statusIcon =16x16 \"$status\") `$text`";
        }
        return "`{$this->emojiForStatus($status)} $text`";
    }
    private function iconStatus(string $status): string {
        return match ($status) {
            'preparing', 'waiting_for_resource', 'waiting_for_callback' => 'pending',
            'scheduled'                                                 => 'created',
            default                                                     => $status,
        };
    }
    private function iconUrl(string $name): ?string {
        $file = "icons/$name.png";
        return is_file(public_path($file)) ? asset($file) : null;
    }
    private function emojiForStatus(string $status): string {
        return match ($status) {
            'manual', 'skipped' => '⚫',
            'created'           => '🕐',
            'success'           => '✅',
            'failed'            => '❌',
            'canceled'          => '⚪',
            'canceling'         => '🔷',
            'pending'           => '⏳',
            'running'           => '🔵',
            default             => "❓ (unknown $status)",
        };
    }
    private function securityProps(string $repoName, string $label, string $icon): array {
        return ChatProps::sender("$repoName [$label]", asset("icons/$icon"), 'git_security');
    }
    private function props(string $name): array {
        return ChatProps::sender($name, asset('icons/icon.git.big.png'), 'git_pipeline');
    }
}
