<?php

namespace App\Flow\Models;

use App\Flow\GateCondition;
use App\Models\BaseModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Gate extends BaseModel {
    protected $table    = 'flow_gates';
    protected $fillable = ['key', 'name', 'phase_id', 'required_role', 'required_approvals', 'condition', 'sort'];
    protected $casts    = ['condition' => 'array', 'required_approvals' => 'integer', 'sort' => 'integer'];
    protected $appends  = [];

    protected static function booted() {
        parent::booted();
        static::saving(fn (Gate $gate) => GateCondition::validate($gate->condition));
    }
    public function phase(): BelongsTo {
        return $this->belongsTo(Phase::class);
    }
}
