<?php

namespace App\Http\Controllers;

use App\Jobs\ChatRemoveUsersJob;
use App\Models\Assignment;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\Request;

class AssignmentController extends Controller {
    public function destroy(Assignment $assignment) {
        $assignment->load('assignee');
        if ($assignment->links(Project::class, User::class)) {
            ChatRemoveUsersJob::dispatch($assignment->parent, [$assignment->assignee->id]);
        }
        return response()->json($assignment->delete());
    }
    public function update(Request $request, Assignment $assignment) {
        $assignment->load('assignee', 'parent');

        if ($request->has('hours_planned') && ! Assignment::canChangeHoursPlanned($assignment->parent)) {
            abort(403, 'You do not have permission to allocate time for this assignment.');
        }

        $roleIds = $request->has('role_ids')
            ? collect($request->validate(['role_ids' => 'present|array', 'role_ids.*' => 'integer|exists:assignment_roles,id'])['role_ids'])->map(fn ($id) => (int)$id)->unique()->sort()->values()->all()
            : null;
        if ($roleIds !== null && $roleIds !== $assignment->role_ids && ! $request->user()->hasAnyRole(['admin', 'project_manager'])) {
            abort(403, 'Only project managers may change assignment roles.');
        }

        $oldHoursPlanned = $assignment->hours_planned ?? 0;

        $assignment->applyAndSave($request, ['parent_id', 'parent_type', 'assignee_id', 'assignee_type', 'flags']);
        if ($roleIds !== null) {
            $assignment->roles()->sync($roleIds);
            $assignment->unsetRelation('roles');
        }

        if ($request->has('hours_planned') && $oldHoursPlanned != $assignment->hours_planned) {
            $assignment->createHoursChangeComment($oldHoursPlanned, $assignment->hours_planned);
        }
        return $assignment;
    }
}
