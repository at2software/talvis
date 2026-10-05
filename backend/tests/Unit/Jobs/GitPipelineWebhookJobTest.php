<?php

namespace Tests\Unit\Jobs;

use App\Jobs\GitPipelineWebhookJob;
use ReflectionClass;
use Tests\TestCase;

class GitPipelineWebhookJobTest extends TestCase {
    private function render(array $builds): string {
        $job = new GitPipelineWebhookJob(collect(), [], [], $builds);
        $m   = (new ReflectionClass($job))->getMethod('pipelineJobList');

        return $m->invokeArgs($job, [$builds, 'U']);
    }
    private function build(int $id, string $stage, string $name): array {
        return ['id' => $id, 'stage' => $stage, 'name' => $name, 'status' => 'success'];
    }
    private function item(int $id, string $name): string {
        return '[![success]('.asset('icons/status-success.png').' =16x16 "success") `'.$name.'`](U/-/jobs/'.$id.')';
    }
    public function test_stages_render_in_the_order_their_jobs_were_created_in(): void {
        $message = $this->render([
            $this->build(30, 'deploy', 'publish'),
            $this->build(10, 'security', 'lint'),
            $this->build(20, 'test', 'unit'),
        ]);

        $this->assertSame(
            $this->item(10, 'lint').' · '.$this->item(20, 'unit').' · '.$this->item(30, 'publish'),
            $message,
        );
    }
    public function test_jobs_within_a_stage_keep_their_creation_order(): void {
        $message = $this->render([
            $this->build(12, 'test', 'smoke'),
            $this->build(10, 'test', 'unit'),
            $this->build(11, 'test', 'e2e'),
        ]);

        $this->assertSame(
            $this->item(10, 'unit').' '.$this->item(11, 'e2e').' '.$this->item(12, 'smoke'),
            $message,
        );
    }
    public function test_a_stage_is_placed_by_its_earliest_job_not_its_latest(): void {
        $message = $this->render([
            $this->build(11, 'security', 'e2e'),
            $this->build(12, 'test', 'unit'),
            $this->build(99, 'security', 'docs'),
        ]);

        $this->assertStringStartsWith($this->item(11, 'e2e').' '.$this->item(99, 'docs').' · ', $message);
    }
    public function test_jobs_with_a_known_icon_render_as_a_combined_status_badge(): void {
        $message = $this->render([$this->build(10, 'security', 'vuln_scan')]);

        $this->assertSame('[![vuln_scan]('.asset('icons/badges/success-vuln.png').' =44x22 "vuln_scan (success)")](U/-/jobs/10)', $message);
    }
    public function test_words_the_badge_does_not_show_follow_it_as_code(): void {
        $message = $this->render([$this->build(10, 'build', 'build-staging-public')]);

        $this->assertSame('[![build-staging-public]('.asset('icons/badges/success-build.png').' =44x22 "build-staging-public (success)") `public`](U/-/jobs/10)', $message);
    }
    public function test_statuses_without_an_icon_fall_back_to_their_emoji(): void {
        $message = $this->render([['id' => 10, 'stage' => 'test', 'name' => 'lint', 'status' => 'bogus']]);

        $this->assertSame('[`❓ (unknown bogus) lint`](U/-/jobs/10)', $message);
    }
    public function test_canceling_jobs_get_their_own_badge(): void {
        $message = $this->render([['id' => 10, 'stage' => 'zap', 'name' => 'dast_api_full', 'status' => 'canceling']]);

        $this->assertSame('[![dast_api_full]('.asset('icons/badges/canceling-dast-full.png').' =44x22 "dast_api_full (canceling)")](U/-/jobs/10)', $message);
    }
    public function test_statuses_waiting_for_a_runner_borrow_the_pending_icon(): void {
        $message = $this->render([['id' => 10, 'stage' => 'test', 'name' => 'lint', 'status' => 'waiting_for_resource']]);

        $this->assertSame('[![waiting_for_resource]('.asset('icons/status-pending.png').' =16x16 "waiting_for_resource") `lint`](U/-/jobs/10)', $message);
    }
    public function test_builds_without_a_stage_are_ordered_without_a_separator(): void {
        $message = $this->render([
            ['id' => 20, 'name' => 'late', 'status' => 'success'],
            ['id' => 10, 'name' => 'early', 'status' => 'success'],
        ]);

        $this->assertSame($this->item(10, 'early').' '.$this->item(20, 'late'), $message);
    }
}
