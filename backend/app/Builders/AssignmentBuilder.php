<?php

namespace App\Builders;

use App\Models\User;

class AssignmentBuilder extends BaseBuilder {
    public function whereParent($obj) {
        return $this->whereMorph($obj);
    }
    public function whereAssignee($obj) {
        return $this->whereMorph($obj, 'assignee');
    }
    public function whereUserAssignee($userId = null) {
        return $this->where('assignee_type', User::class)->when($userId !== null, fn ($q) => $q->where('assignee_id', $userId));
    }
    public function whereParentAndAssignee($parent, $assignee) {
        return $this->whereParent($parent)->whereAssignee($assignee);
    }
}
