<?php

namespace Tests\Unit\Jobs;

use App\Jobs\GitPipelineWebhookJob;
use ReflectionClass;
use Tests\TestCase;

class GitPipelineWebhookJobTest extends TestCase {
    private function render(array $builds): string {
        $job = new GitPipelineWebhookJob(collect(), [], [], $builds);
        $m   = (new ReflectionClass($job))->getMethod('pipelineJobList');
        $m->setAccessible(true);

        return $m->invokeArgs($job, [$builds, 'U']);
    }
    private function build(int $id, string $stage, string $name): array {
        return ['id' => $id, 'stage' => $stage, 'name' => $name, 'status' => 'success'];
    }
    public function test_stages_render_in_the_order_their_jobs_were_created_in(): void {
        $message = $this->render([
            $this->build(30, 'deploy', 'deploy'),
            $this->build(10, 'security', 'generate_sbom'),
            $this->build(20, 'test', 'npm-audit'),
        ]);

        $this->assertSame(
            '[`✅ generate_sbom`](U/-/jobs/10) · [`✅ npm-audit`](U/-/jobs/20) · [`✅ deploy`](U/-/jobs/30)',
            $message,
        );
    }
    public function test_jobs_within_a_stage_keep_their_creation_order(): void {
        $message = $this->render([
            $this->build(12, 'test', 'sast'),
            $this->build(10, 'test', 'npm-audit'),
            $this->build(11, 'test', 'vuln_scan'),
        ]);

        $this->assertSame(
            '[`✅ npm-audit`](U/-/jobs/10) [`✅ vuln_scan`](U/-/jobs/11) [`✅ sast`](U/-/jobs/12)',
            $message,
        );
    }
    public function test_a_stage_is_placed_by_its_earliest_job_not_its_latest(): void {
        $message = $this->render([
            $this->build(11, 'security', 'vuln_scan'),
            $this->build(12, 'test', 'npm-audit'),
            $this->build(99, 'security', 'grype'),
        ]);

        $this->assertStringStartsWith('[`✅ vuln_scan`](U/-/jobs/11) [`✅ grype`](U/-/jobs/99) · ', $message);
    }
    public function test_builds_without_a_stage_are_ordered_without_a_separator(): void {
        $message = $this->render([
            ['id' => 20, 'name' => 'late', 'status' => 'success'],
            ['id' => 10, 'name' => 'early', 'status' => 'success'],
        ]);

        $this->assertSame('[`✅ early`](U/-/jobs/10) [`✅ late`](U/-/jobs/20)', $message);
    }
}
