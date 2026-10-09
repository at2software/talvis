<?php

namespace App\Flow\Models;

use App\Models\BaseModel;

class RiskClass extends BaseModel {
    protected $table    = 'flow_risk_classes';
    protected $fillable = ['key', 'name', 'level', 'release_required_approvals'];
    protected $casts    = ['level' => 'integer', 'release_required_approvals' => 'integer'];
    protected $appends  = [];
}
