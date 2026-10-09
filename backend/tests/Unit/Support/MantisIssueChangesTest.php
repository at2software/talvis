<?php

namespace Tests\Unit\Support;

use App\Jobs\MantisIssueEventJob;
use App\Support\MantisIssueChanges;
use Carbon\Carbon;
use Tests\TestCase;

class MantisIssueChangesTest extends TestCase {
    private Carbon $since;

    protected function setUp(): void {
        parent::setUp();
        $this->since = Carbon::parse('2026-10-08 10:00:00');
    }
    private function issue(array $overrides = []): array {
        return [
            'id'          => 42,
            'summary'     => 'Login broken',
            'description' => 'Steps …',
            'status'      => ['name' => 'assigned'],
            'handler'     => ['name' => 'jane'],
            'reporter'    => ['name' => 'tom'],
            'project'     => ['name' => 'Shop'],
            'created_at'  => '2026-10-01T09:00:00+02:00',
            'updated_at'  => '2026-10-08T10:30:00+02:00',
            'notes'       => [],
            ...$overrides,
        ];
    }
    public function test_issue_created_after_the_cursor_is_opened(): void {
        $changes = MantisIssueChanges::between($this->issue(['created_at' => '2026-10-08T10:10:00+00:00']), null, $this->since);

        $this->assertSame([['action' => 'open', 'by' => 'tom', 'text' => 'Steps …']], $changes);
    }
    public function test_status_and_handler_changes_are_compared_with_the_snapshot(): void {
        $previous = ['status' => 'assigned', 'handler' => 'jane'];

        $this->assertSame([['action' => 'close', 'status' => 'resolved']], MantisIssueChanges::between($this->issue(['status' => ['name' => 'resolved']]), $previous, $this->since));
        $this->assertSame([['action' => 'reopen', 'status' => 'feedback']], MantisIssueChanges::between($this->issue(['status' => ['name' => 'feedback']]), ['status' => 'closed', 'handler' => 'jane'], $this->since));
        $this->assertSame([['action' => 'assign', 'handler' => null]], MantisIssueChanges::between($this->issue(['handler' => null]), $previous, $this->since));
    }
    public function test_unknown_issues_only_report_new_notes(): void {
        $issue = $this->issue(['status' => ['name' => 'closed'], 'notes' => [
            ['reporter' => ['name' => 'old'], 'text' => 'before', 'created_at' => '2026-10-07T12:00:00+00:00'],
            ['reporter' => ['name' => 'jane'], 'text' => ' fixed ', 'created_at' => '2026-10-08T10:20:00+00:00'],
        ]]);

        $this->assertSame([['action' => 'note', 'by' => 'jane', 'text' => 'fixed']], MantisIssueChanges::between($issue, null, $this->since));
    }
    public function test_chat_message_links_the_issue(): void {
        $job = new MantisIssueEventJob(collect(), $this->issue(['status' => ['name' => 'resolved']]), 'https://mantis/view.php?id=42', ['action' => 'close', 'status' => 'resolved']);

        $this->assertSame('[`✅ #42`](https://mantis/view.php?id=42) Login broken → `resolved`', $job->message());
    }
}
