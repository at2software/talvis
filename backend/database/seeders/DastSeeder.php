<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\Connection;
use App\Models\ConnectionProject;
use App\Models\DebriefPositive;
use App\Models\DebriefProblem;
use App\Models\DebriefProblemCategory;
use App\Models\DebriefProjectDebrief;
use App\Models\DebriefSolution;
use App\Models\GitlabAuditProject;
use App\Models\MarketingActivity;
use App\Models\MarketingInitiative;
use App\Models\MarketingInitiativeActivity;
use App\Models\MarketingPerformanceMetric;
use App\Models\MarketingWorkflow;
use App\Models\PluginLink;
use App\Models\Project;
use App\Models\Sentinel;
use App\Models\Task;
use App\Models\UptimeMonitor;
use App\Models\User;
use App\Models\Vcard;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;

class DastSeeder extends Seeder {
    private User $user;

    public function run(): void {
        DemoSeeder::ensureAllowedEnvironment();
        config(['broadcasting.default' => 'null']);
        Bus::fake();
        Mail::fake();
        Notification::fake();

        $this->user = User::query()->orderBy('id')->firstOrFail();
        Auth::setUser($this->user);

        foreach ($this->firstAndLast(Project::class) as $i => $project) {
            $this->seedProject($project, $i);
        }
        foreach ($this->firstAndLast(MarketingInitiative::class) as $i => $initiative) {
            $this->seedInitiative($initiative, $i);
        }
        $this->seedStandalone();
        $this->seedDeletionLogs();
    }
    private function firstAndLast(string $model): array {
        return [$model::query()->orderBy('id')->firstOrFail(), $model::query()->orderByDesc('id')->firstOrFail()];
    }
    private function seedProject(Project $project, int $i): void {
        $category = DebriefProblemCategory::query()->orderBy('id')->firstOrFail();
        $debrief  = DebriefProjectDebrief::forceCreate([
            'project_id'           => $project->id,
            'conducted_by_user_id' => $this->user->id,
            'debriefed_user_id'    => $this->user->id,
            'conducted_at'         => now(),
            'summary_notes'        => "DAST debrief $i",
            'rating'               => 3,
            'status'               => 'draft',
        ]);
        $problem = DebriefProblem::forceCreate([
            'title'                       => "DAST problem $i",
            'debrief_problem_category_id' => $category->id,
            'created_by_user_id'          => $this->user->id,
        ]);
        $solution = DebriefSolution::forceCreate(['title' => "DAST solution $i", 'created_by_user_id' => $this->user->id]);
        $positive = DebriefPositive::forceCreate([
            'title'                       => "DAST positive $i",
            'debrief_project_debrief_id'  => $debrief->id,
            'debrief_problem_category_id' => $category->id,
            'reported_by_user_id'         => $this->user->id,
        ]);
        $debrief->problems()->attach($problem->id, ['severity' => 'medium']);
        $debrief->positives()->attach($positive->id);
        $problem->solutions()->attach($solution->id, ['effectiveness_rating' => 3, 'debrief_project_debrief_id' => $debrief->id]);

        Task::forceCreate([...$project->toPoly(), 'name' => "DAST task $i", 'description' => 'Created for the DAST scan.', 'state' => 0]);
        PluginLink::forceCreate([...$project->toPoly(), 'name' => "DAST Mantis $i", 'type' => 'mantisbt', 'url' => "https://mantis$i.example.com/"]);

        $partner    = Company::query()->whereKeyNot($project->company_id)->orderBy('id', $i ? 'desc' : 'asc')->firstOrFail();
        $connection = Connection::forceCreate(['company1_id' => $project->company_id, 'company2_id' => $partner->id, 'comment' => "DAST connection $i"]);
        ConnectionProject::forceCreate(['connection_id' => $connection->id, 'project_id' => $project->id]);

        UptimeMonitor::forceCreate([
            'name'               => "DAST monitor $i",
            'url'                => "https://monitor$i.example.com/",
            'is_active'          => false,
            'created_by_user_id' => $this->user->id,
        ])->projects()->attach($project->id);

        GitlabAuditProject::forceCreate([
            'gitlab_url'          => 'https://gitlab.example.com',
            'namespace_with_path' => "dast/project-$i",
            'project_name'        => "DAST project $i",
            'gitlab_project_id'   => 1000 + $i,
            'company_id'          => $project->company_id,
            'environment'         => 'staging',
            'jobs'                => '[]',
        ]);
    }
    private function seedInitiative(MarketingInitiative $initiative, int $i): void {
        $metric   = MarketingPerformanceMetric::forceCreate(['name' => "DAST metric $i", 'metric_type' => 'counter', 'target_value' => 10]);
        $workflow = MarketingWorkflow::forceCreate(['name' => "DAST workflow $i", 'is_active' => true]);
        $activity = MarketingActivity::forceCreate([
            'marketing_workflow_id' => $workflow->id,
            'name'                  => "DAST activity $i",
            'day_offset'            => $i,
            'description'           => 'Created for the DAST scan.',
        ]);
        $activity->performanceMetrics()->attach($metric->id, ['target_value' => 5]);
        $initiative->workflows()->attach($workflow->id, ['is_active' => true]);
        $initiative->performanceMetrics()->attach($metric->id, ['target_value' => 10]);

        MarketingInitiativeActivity::forceCreate([
            'marketing_initiative_id' => $initiative->id,
            'marketing_workflow_id'   => $workflow->id,
            'name'                    => "DAST initiative activity $i",
            'day_offset'              => $i,
            'description'             => 'Created for the DAST scan.',
        ])->performanceMetrics()->attach($metric->id);
    }
    private function seedStandalone(): void {
        foreach ([0, 1] as $i) {
            Sentinel::forceCreate([
                'name'       => "DAST sentinel $i",
                'table_name' => 'companies',
                'condition'  => '[]',
                'result'     => '[]',
                'user_id'    => $this->user->id,
            ]);
        }
    }
    private function seedDeletionLogs(): void {
        foreach ([0, 1] as $i) {
            Company::create(['vcard' => Vcard::forName("DAST deleted company $i")])->delete();
        }
    }
}
