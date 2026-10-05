<?php

namespace App\Support;

class PipelineJobKind {
    private const SEPARATORS    = '/[_\-.:\/\s]+/';
    private const STAGING_WORDS = ['staging', 'stage', 'dev', 'develop', 'development', 'test', 'testing', 'review', 'qa', 'uat', 'preview', 'demo'];
    private const PROD_WORDS    = ['prod', 'production', 'live'];

    /** @var array<string, array{pattern: string, implied: list<string>}> */
    private const KINDS = [
        'dast-full'      => ['pattern' => '/\b(dast|zap)\b.*\bfull\b/', 'implied' => ['dast', 'zap', 'api', 'full', 'scan']],
        'dast-quick'     => ['pattern' => '/\b(dast|zap)\b/', 'implied' => ['dast', 'zap', 'api', 'quick', 'baseline', 'scan']],
        'sbom'           => ['pattern' => '/\bsbom\b/', 'implied' => ['sbom', 'generate']],
        'vuln'           => ['pattern' => '/\b(vuln|grype|trivy|container[ _-]?scan)/', 'implied' => ['vuln', 'vulnerability', 'grype', 'trivy', 'container', 'scan', 'scanning']],
        'npm-audit'      => ['pattern' => '/\b(npm|yarn|pnpm)\b.*\baudit\b/', 'implied' => ['npm', 'yarn', 'pnpm', 'audit']],
        'composer-audit' => ['pattern' => '/\bcomposer\b.*\baudit\b/', 'implied' => ['composer', 'audit']],
        'cargo-audit'    => ['pattern' => '/\bcargo\b.*\baudit\b/', 'implied' => ['cargo', 'audit']],
        'sast'           => ['pattern' => '/\b(sast|semgrep|codeql)/', 'implied' => ['sast', 'semgrep', 'codeql']],
        'db-reset'       => ['pattern' => '/\b(reset|wipe|seed)\b.*\b(db|database)\b|\b(db|database)\b.*\b(reset|wipe|seed)\b/', 'implied' => ['reset', 'wipe', 'seed', 'db', 'database']],
        'deploy'         => ['pattern' => '/\bdeploy\b/', 'implied' => ['deploy']],
        'build'          => ['pattern' => '/\b(build|compile)\b/', 'implied' => ['build', 'compile']],
    ];

    /** @var array<string, array{default: string, staging: string, prod: string}> */
    private const BY_ENVIRONMENT = [
        'build'    => ['default' => 'staging', 'staging' => 'build', 'prod' => 'build-prod'],
        'db-reset' => ['default' => 'staging', 'staging' => 'db-reset', 'prod' => 'db-reset-prod'],
        'deploy'   => ['default' => 'prod', 'staging' => 'deploy-staging', 'prod' => 'deploy'],
    ];

    public static function of(string $jobName): ?string {
        $base = self::base($jobName);
        if ($base === null || ! isset(self::BY_ENVIRONMENT[$base])) {
            return $base;
        }
        $variants = self::BY_ENVIRONMENT[$base];
        return $variants[self::environment($jobName) ?? $variants['default']];
    }
    public static function remainder(string $jobName): string {
        $base    = self::base($jobName);
        $implied = $base === null ? [] : self::KINDS[$base]['implied'];
        if (isset(self::BY_ENVIRONMENT[$base])) {
            $implied = [...$implied, ...self::STAGING_WORDS, ...self::PROD_WORDS];
        }
        $rest = array_filter(self::words($jobName), fn (string $word) => ! in_array(strtolower($word), $implied, true));
        preg_match(self::SEPARATORS, $jobName, $separator);
        return implode($separator[0] ?? '-', $rest);
    }
    private static function base(string $jobName): ?string {
        $normalized = strtolower(implode(' ', self::words($jobName)));
        foreach (self::KINDS as $kind => ['pattern' => $pattern]) {
            if (preg_match($pattern, $normalized)) {
                return $kind;
            }
        }
        return null;
    }
    private static function environment(string $jobName): ?string {
        $words = array_map('strtolower', self::words($jobName));
        return match (true) {
            (bool)array_intersect($words, self::PROD_WORDS)    => 'prod',
            (bool)array_intersect($words, self::STAGING_WORDS) => 'staging',
            default                                            => null,
        };
    }

    /**
     * @return list<string>
     */
    private static function words(string $jobName): array {
        return preg_split(self::SEPARATORS, $jobName, -1, PREG_SPLIT_NO_EMPTY);
    }
}
