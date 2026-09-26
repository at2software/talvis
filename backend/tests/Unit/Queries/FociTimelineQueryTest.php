<?php

namespace Tests\Unit\Queries;

use App\Models\Focus;
use App\Models\Project;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('database')]
class FociTimelineQueryTest extends TestCase {
    use DatabaseTransactions;

    private const TIMELINE_TABLES = '/\b(foci|users)\b/i';

    public function test_sums_duration_per_user_per_period(): void {
        $project = Project::factory()->create();
        $alice   = User::factory()->create();
        $bob     = User::factory()->create();

        Focus::factory()->forParent($project)->create(['user_id' => $alice->id, 'started_at' => Carbon::parse('2025-01-05'), 'duration' => 2]);
        Focus::factory()->forParent($project)->create(['user_id' => $alice->id, 'started_at' => Carbon::parse('2025-01-20'), 'duration' => 3]);
        Focus::factory()->forParent($project)->create(['user_id' => $alice->id, 'started_at' => Carbon::parse('2025-03-01'), 'duration' => 4]);
        Focus::factory()->forParent($project)->create(['user_id' => $bob->id, 'started_at' => Carbon::parse('2025-06-10'), 'duration' => 5]);

        $timeline = $project->timeline_chart;

        $byUser       = $timeline->keyBy(fn ($_) => $_['user']['id']);
        $alicePeriods = $byUser[$alice->id]['data']->keyBy('period');
        $bobPeriods   = $byUser[$bob->id]['data']->keyBy('period');

        self::assertSame(5.0, $alicePeriods['2025-01-01']['value']);
        self::assertSame(4.0, $alicePeriods['2025-03-01']['value']);
        self::assertSame(0.0, $alicePeriods['2025-02-01']['value']);

        self::assertSame(5.0, $bobPeriods['2025-06-01']['value']);
        self::assertSame(0.0, $bobPeriods['2025-01-01']['value']);
    }

    public function test_gives_every_user_the_same_period_axis_in_chronological_order(): void {
        $project = Project::factory()->create();
        $alice   = User::factory()->create();
        $bob     = User::factory()->create();

        Focus::factory()->forParent($project)->create(['user_id' => $alice->id, 'started_at' => Carbon::parse('2025-01-05'), 'duration' => 2]);
        Focus::factory()->forParent($project)->create(['user_id' => $bob->id, 'started_at' => Carbon::parse('2025-03-10'), 'duration' => 5]);
        Focus::factory()->forParent($project)->create(['user_id' => $alice->id, 'started_at' => Carbon::parse('2025-06-20'), 'duration' => 4]);

        $expected = ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01'];

        foreach ($project->timeline_chart as $user) {
            self::assertSame($expected, $user['data']->pluck('period')->all());
        }
    }

    public function test_one_query_per_call_regardless_of_user_count(): void {
        $one  = $this->projectWithOneFocusPerUser(1);
        $five = $this->projectWithOneFocusPerUser(5);

        $sql = [];
        DB::listen(function ($query) use (&$sql) { $sql[] = $query->sql; });

        $sql = [];
        $one->timeline_chart;
        $oneUserQueries = $this->timelineQueryCount($sql);

        $sql = [];
        $five->timeline_chart;
        $fiveUserQueries = $this->timelineQueryCount($sql);

        self::assertSame($oneUserQueries, $fiveUserQueries, 'the timeline must not issue queries per user');
        self::assertLessThanOrEqual(4, $fiveUserQueries);
    }

    private function projectWithOneFocusPerUser(int $userCount): Project {
        $project = Project::factory()->create();

        foreach (User::factory()->count($userCount)->create() as $user) {
            Focus::factory()->forParent($project)->create(['user_id' => $user->id, 'started_at' => Carbon::parse('2025-06-15'), 'duration' => 1]);
        }
        return $project;
    }

    private function timelineQueryCount(array $sql): int {
        return count(preg_grep(self::TIMELINE_TABLES, $sql));
    }
}
