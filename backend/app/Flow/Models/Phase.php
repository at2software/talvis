<?php

namespace App\Flow\Models;

use App\Models\BaseModel;
use App\Models\ProjectState;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Phase extends BaseModel {
    protected $table    = 'flow_phases';
    protected $fillable = ['key', 'name', 'project_state_id', 'sort'];
    protected $casts    = ['project_state_id' => 'integer', 'sort' => 'integer'];
    protected $appends  = [];

    public function projectState(): BelongsTo {
        return $this->belongsTo(ProjectState::class);
    }
    public function gates(): HasMany {
        return $this->hasMany(Gate::class)->orderBy('sort')->orderBy('id');
    }
    public static function forState(?int $stateId): ?self {
        return $stateId === null ? null : static::where('project_state_id', $stateId)->first();
    }
}
