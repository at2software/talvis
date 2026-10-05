<?php

namespace Database\Factories;

use App\Models\Company;
use App\Models\Project;
use App\Models\ProjectState;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

/**
 * @extends Factory<Project>
 */
class ProjectFactory extends Factory {
    protected $model = Project::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array {
        return [
            'company_id'       => Company::factory(),
            'name'             => fake()->words(3, true),
            'description'      => '',
            'is_time_based'    => false,
            'is_internal'      => false,
            'lead_probability' => 0.2,
        ];
    }

    public function withState(int $progress, bool $successful = true): static {
        return $this->afterCreating(function (Project $project) use ($progress, $successful) {
            $project->states()->attach(
                ProjectStateFactory::new()->state([
                    'progress'      => $progress,
                    'is_successful' => $successful,
                ])->create()->id
            );
        });
    }
    public function running(): static {
        return $this->withState(ProjectState::Running, false);
    }
    public function finished(bool $successful = true): static {
        return $this->withState(ProjectState::Finished, $successful);
    }
    public function workEstimated(float $hours): static {
        return $this->afterCreating(function (Project $project) use ($hours) {
            DB::table('projects')->where('id', $project->id)->update(['work_estimated' => $hours]);
            $project->refresh();
        });
    }
}
