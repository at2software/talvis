<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class UserEmployment extends BaseModel {
    use HasFactory;

    public const DEFAULT_TYPE     = 'Festanstellung';
    public const TIME_BASED_TYPES = ['Werkstudent'];
    public const DAYS             = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

    protected function casts(): array {
        return [
            'hpw' => 'double',
        ];
    }

    protected $attributes = ['description' => self::DEFAULT_TYPE];
    protected $fillable   = ['description', 'is_time_based', 'mo', 'tu', 'we', 'th', 'fr', 'sa', 'su', 'user_id', 'started_at', 'is_active'];

    public function user() {
        return $this->belongsTo(User::class);
    }
    public function averageHoursPerWorkday(): float {
        $hours = array_filter(array_map(fn ($_) => (float)$this->$_, self::DAYS));
        return count($hours) ? array_sum($hours) / count($hours) : 0;
    }
}
