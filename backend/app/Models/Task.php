<?php

namespace App\Models;

use App\Enums\TaskState;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Task extends BaseModel {
    use HasFactory;

    protected $fillable = ['parent_type', 'parent_id', 'name', 'description', 'link', 'state'];

    protected function casts(): array {
        return ['state' => TaskState::class];
    }

    /** @param Collection<int, Task> $tasks */
    public static function attachLinks(Collection $tasks): Collection {
        $projects  = Project::with('company.projectsUnfinished')->findMany($tasks->map->linkedProjectId()->filter()->unique())->keyBy('id');
        $companies = Company::with('projectsUnfinished')->findMany($tasks->map->linkedCompanyId()->filter()->unique())->keyBy('id');
        return $tasks->each(fn (Task $task) => $task
            ->setRelation('linked_project', $projects->get($task->linkedProjectId()))
            ->setRelation('linked_company', $companies->get($task->linkedCompanyId())));
    }

    public function linkedProjectId(): ?int {
        return $this->linkedId('projects');
    }
    public function linkedCompanyId(): ?int {
        return $this->linkedId('customers|companies');
    }
    private function linkedId(string $segment): ?int {
        return preg_match("~(?:^|/)(?:$segment)/(\d+)~", (string)$this->link, $match) ? (int)$match[1] : null;
    }
    public function parent() {
        return $this->morphTo();
    }
    public function assignee() {
        return $this->morphOne(Assignment::class, 'parent')->with('assignee')->whereRaw('(flags & ?) = 0', [Assignment::FLAG_CO_ASSIGNEE]);
    }
    public function coAssignees() {
        return $this->morphMany(Assignment::class, 'parent')->with('assignee')->whereRaw('(flags & ?) != 0', [Assignment::FLAG_CO_ASSIGNEE]);
    }
}
