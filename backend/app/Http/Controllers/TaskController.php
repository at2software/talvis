<?php

namespace App\Http\Controllers;

use App\Models\Assignment;
use App\Models\Project;
use App\Models\Task;
use App\Models\User;
use Illuminate\Http\Request;

class TaskController extends Controller {
    public function store(Request $request) {
        $new = new Task($request->user()->toPoly());
        $new->applyAndSave($request, ['project_id', 'assignment_id', 'task_id', 'milestone_id']);
        return $new;
    }
    public function storeForProject(Request $request, Project $_) {
        $data = $request->validate([
            'name'        => 'required|string',
            'description' => 'nullable|string',
            'parent_type' => 'nullable|string',
            'parent_id'   => 'nullable|integer',
        ]);

        if (isset($data['parent_type']) && isset($data['parent_id'])) {
            $task = Task::create($data);
        } else {
            $task = Task::create(array_merge($_->toPoly(), $data));
        }

        Assignment::create([
            'parent_type'   => 'App\\Models\\Task',
            'parent_id'     => $task->id,
            'assignee_type' => 'App\\Models\\User',
            'assignee_id'   => $request->user()->id,
        ]);
        return $task->load('assignee.assignee');
    }
    public function index(Request $request) {
        return $request->user()?->unfinishedTasks()->with('parent', 'assignee.assignee', 'coAssignees.assignee')->get() ?? [];
    }
    public function show(Task $task) {
        return $task->load('parent', 'assignee.assignee', 'coAssignees.assignee');
    }
    public function indexForProject(Request $request, Project $_) {
        return $_->unfinishedTasks()->with('assignee.assignee', 'coAssignees.assignee')->get();
    }
    public function destroy(Request $request, Project $_, Task $task) {
        return $task->delete();
    }
    public function update(Request $request, Project $_, Task $task) {
        return $task->applyAndSave($request);
    }
    public function assign(Request $request, Project $_, Task $task) {
        $body             = $this->getBody();
        $ass              = $_->assignees()->where('user_id', $body->user_id)->firstOrFail();
        $_->assignment_id = $ass->id;
        return $task;
    }
    public function addCoAssignee(Request $request, Task $task) {
        $data = $request->validate(['user_id' => 'required|integer|exists:users,id']);

        return Assignment::create([
            'parent_type'   => Task::class,
            'parent_id'     => $task->id,
            'assignee_type' => User::class,
            'assignee_id'   => $data['user_id'],
            'flags'         => Assignment::FLAG_CO_ASSIGNEE,
        ])->load('assignee');
    }
    public function removeCoAssignee(Request $request, Task $task, Assignment $assignment) {
        abort_unless($assignment->parent_type === Task::class && (int)$assignment->parent_id === (int)$task->id && ($assignment->flags & Assignment::FLAG_CO_ASSIGNEE), 404);
        $assignment->delete();
    }
}
