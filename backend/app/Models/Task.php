<?php

namespace App\Models;

use App\Enums\TaskState;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Task extends BaseModel {
    use HasFactory;

    protected $fillable = ['parent_type', 'parent_id', 'name', 'description', 'link', 'state'];

    protected function casts(): array {
        return ['state' => TaskState::class];
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
