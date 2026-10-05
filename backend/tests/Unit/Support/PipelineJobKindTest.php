<?php

namespace Tests\Unit\Support;

use App\Support\PipelineJobKind;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class PipelineJobKindTest extends TestCase {
    public static function jobNames(): array {
        return [
            ['generate_sbom', 'sbom'],
            ['sbom', 'sbom'],
            ['vuln_scan', 'vuln'],
            ['grype', 'vuln'],
            ['container_scanning', 'vuln'],
            ['npm-audit', 'npm-audit'],
            ['yarn audit', 'npm-audit'],
            ['composer-audit', 'composer-audit'],
            ['composer audit', 'composer-audit'],
            ['cargo audit', 'cargo-audit'],
            ['cargo-audit', 'cargo-audit'],
            ['semgrep-sast', 'sast'],
            ['sast', 'sast'],
            ['dast_quick', 'dast-quick'],
            ['dast_api_quick', 'dast-quick'],
            ['zap-baseline', 'dast-quick'],
            ['dast_full', 'dast-full'],
            ['dast_api_full', 'dast-full'],
            ['build', 'build'],
            ['build_staging', 'build'],
            ['build-test', 'build'],
            ['build_prod', 'build-prod'],
            ['build-live', 'build-prod'],
            ['deploy', 'deploy'],
            ['deploy_prod', 'deploy'],
            ['deploy-live', 'deploy'],
            ['deploy_staging', 'deploy-staging'],
            ['deploy-dev', 'deploy-staging'],
            ['staging:deploy', 'deploy-staging'],
            ['deploy_qa', 'deploy-staging'],
            ['deploy-preview', 'deploy-staging'],
            ['reset_staging_db', 'db-reset'],
            ['db:seed', 'db-reset'],
            ['reset_prod_db', 'db-reset-prod'],
            ['lint', null],
            ['publish-foss', null],
        ];
    }
    public static function remainders(): array {
        return [
            ['build-staging-public', 'public'],
            ['build-localized', 'localized'],
            ['build_prod_eu', 'eu'],
            ['deploy_staging_internal', 'internal'],
            ['deploy_staging', ''],
            ['deploy_dev_test', ''],
            ['deploy_prod', ''],
            ['deploy_production_eu', 'eu'],
            ['reset_staging_db', ''],
            ['dast_api_quick', ''],
            ['dast_api_full', ''],
            ['generate_sbom', ''],
            ['vuln_scan', ''],
            ['npm-audit', ''],
            ['semgrep-sast', ''],
            ['lint', 'lint'],
        ];
    }

    #[DataProvider('jobNames')]
    public function test_job_names_map_to_their_icon_kind(string $jobName, ?string $kind): void {
        $this->assertSame($kind, PipelineJobKind::of($jobName));
    }

    #[DataProvider('remainders')]
    public function test_the_remainder_drops_words_the_icon_already_shows(string $jobName, string $remainder): void {
        $this->assertSame($remainder, PipelineJobKind::remainder($jobName));
    }
}
