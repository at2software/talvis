<?php

namespace App\Models;

use App\Builders\ProjectStateBuilder;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProjectState extends BaseModel {
    use HasFactory;

    protected $fillable = ['name', 'progress', 'color', 'is_in_stats', 'is_successful', 'created_at', 'updated_at'];
    protected $hidden   = ['laravel_through_key'];

    protected function casts(): array {
        return [
            'progress'      => 'integer',
            'is_in_stats'   => 'boolean',
            'is_successful' => 'boolean',
        ];
    }

    const Prepared = 0;
    const Running  = 1;
    const Finished = 2;

    public function projects() {
        return $this->belongsToMany(Project::class);
    }
    public function newEloquentBuilder($query) {
        return new ProjectStateBuilder($query);
    }
}
