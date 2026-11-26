<?php

namespace Tests\Unit\Models;

use App\Models\Company;
use App\Models\Param;
use App\Models\Project;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class ProjectPostponeReminderByEstimateTest extends TestCase {
    use DatabaseTransactions;

    protected function setUp(): void {
        parent::setUp();
        Carbon::setTestNow('2026-11-13 10:00:00');
    }
    protected function tearDown(): void {
        Carbon::setTestNow();
        parent::tearDown();
    }
    private function project(float $personDays, ?string $remindAt): Project {
        $project = Project::factory()->for(Company::factory()->create())->create(['remind_at' => $remindAt, 'due_at' => '2026-11-14']);
        $hpd     = (float)Param::get('INVOICE_HPD')->value;
        DB::table('projects')->where('id', $project->id)->update(['work_estimated' => $personDays * $hpd]);
        return $project->refresh();
    }
    private function remindDate(Project $project): string {
        return Carbon::parse($project->fresh()->remind_at)->toDateString();
    }
    public function test_reminder_is_pushed_by_estimated_person_days_skipping_weekends(): void {
        $project = $this->project(3, '2026-11-14');

        $project->postponeReminderByEstimate();

        self::assertSame('2026-11-18', $this->remindDate($project));
        self::assertSame('2026-11-14', Carbon::parse($project->fresh()->due_at)->toDateString());
    }
    public function test_partial_person_days_round_up(): void {
        $project = $this->project(0.5, null);

        $project->postponeReminderByEstimate();

        self::assertSame('2026-11-16', $this->remindDate($project));
    }
    public function test_later_reminder_is_overwritten(): void {
        $project = $this->project(3, '2026-12-31');

        $project->postponeReminderByEstimate();

        self::assertSame('2026-11-18', $this->remindDate($project));
    }
    public function test_project_without_estimate_is_untouched(): void {
        $project = $this->project(0, '2026-11-14');

        $project->postponeReminderByEstimate();

        self::assertSame('2026-11-14', $this->remindDate($project));
    }
}
