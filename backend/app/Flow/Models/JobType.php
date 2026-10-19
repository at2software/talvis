<?php

namespace App\Flow\Models;

use App\Flow\JobInputSchema;
use App\Models\BaseModel;
use Illuminate\Database\Eloquent\Relations\HasMany;

class JobType extends BaseModel {
    protected $table    = 'flow_job_types';
    protected $fillable = ['key', 'name', 'description', 'input_schema', 'review_gate_keys'];
    protected $casts    = ['input_schema' => 'array', 'review_gate_keys' => 'array'];
    protected $appends  = [];

    protected static function booted() {
        parent::booted();
        static::saving(fn (JobType $type) => JobInputSchema::validateSchema($type->input_schema));
    }
    public function jobs(): HasMany {
        return $this->hasMany(Job::class, 'type', 'key');
    }
    public static function byKey(string $key): ?self {
        return static::where('key', $key)->first();
    }
}
