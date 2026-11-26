<?php

namespace App\Models;

use App\Builders\AssignmentBuilder;
use App\Enums\CommentType;
use App\Traits\HasParams;
use App\Traits\HasTasksTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Assignment extends BaseModel {
    use HasFactory;
    use HasParams;
    use HasTasksTrait;

    const FLAG_MAIN_CONTACT = 1 << 0; // Binary flag: 1 (for main contact used in quotes/invoices)
    const FLAG_CO_ASSIGNEE  = 1 << 1;

    protected $fillable = ['parent_id', 'parent_type', 'assignee_id', 'assignee_type', 'hours_planned', 'hours_weekly', 'flags'];
    protected $appends  = ['avg_hpd', 'role_ids', 'role_names'];
    protected $with     = ['avgHpdParam', 'roles'];
    protected $hidden   = ['avgHpdParam', 'roles'];

    public function avgHpdParam() {
        return $this->latestParamFor('ASSIGNMENT_AVG_HPD');
    }
    public function getAvgHpdAttribute() {
        return $this->avgHpdParam?->value;
    }
    public function getRoleIdsAttribute(): array {
        return $this->roles->pluck('id')->all();
    }
    public function getRoleNamesAttribute(): array {
        return $this->roles->pluck('name')->all();
    }
    public function getAssignedUserIdAttribute() {
        return $this->assignee_type === User::class ? $this->assignee_id : null;
    }
    public function roles() {
        return $this->belongsToMany(AssignmentRole::class)->orderBy('assignment_roles.id');
    }
    public function assignRoles(string ...$names): void {
        $this->roles()->syncWithoutDetaching(array_map(fn ($name) => AssignmentRole::firstOrCreate(['name' => $name])->id, $names));
        $this->unsetRelation('roles');
    }
    public function parent() {
        return $this->morphTo();
    }
    public function assignee() {
        return $this->morphTo();
    }
    public function createHoursChangeComment(float $oldTime, float $newTime): void {
        $difference         = $newTime - $oldTime;
        $sign               = $difference > 0 ? 'added' : 'removed';
        $absoluteDifference = abs($difference);
        $assigneeName       = $this->assignee ? $this->assignee->name : 'Unknown';

        Comment::create([
            'text'    => "{$sign} {$absoluteDifference} hours for {$assigneeName}",
            'type'    => CommentType::Info,
            'is_mini' => true,
            'user_id' => request()->user()->id,
            ...$this->parent->toPoly(),
        ]);
    }
    public static function canChangeHoursPlanned($parent): bool {
        if (! $parent->has_time_budget) {
            return true;
        }
        return request()->user()->hasAnyRole(['hr', 'project_manager']);
    }
    public function links($parent_type, $assignee_type) {
        return $this->parent_type === $parent_type && $this->assignee_type === $assignee_type;
    }
    public function newEloquentBuilder($query) {
        return new AssignmentBuilder($query);
    }
}
