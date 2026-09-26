<?php

namespace App\Collections;

use App\Models\BaseCollection;
use Illuminate\Database\Eloquent\Collection;

class ProjectCollection extends BaseCollection {
    public function appendProjectCollection() {
        $this->appendRequest();
        $this->append(['hours_invested', 'work_estimated']);
        $this->each(function ($project) {
            if (isset($project->connectionProjects)) {
                $project->setRelation('connectionProjects', $project->connectionProjects->mapSimplified($project, false));
            }
            if ($project->relationLoaded('assigned_users')) {
                $project->assigned_users->each(function ($user) {
                    $user->makeHidden(['pivot', 'activeEmployment']);
                });
            }
        });
        return $this;
    }
}
