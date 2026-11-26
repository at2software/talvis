<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class VacationGrant extends BaseModel {
    use HasFactory;

    protected function casts(): array {
        return [
            'expires_at' => 'date',
            'amount'     => 'double',
        ];
    }

    protected $fillable = ['user_id', 'amount', 'name', 'expires_at'];

    public function user() {
        return $this->belongsTo(User::class);
    }
    public function vacations() {
        return $this->hasMany(Vacation::class);
    }
    public function scopeUnexpired($query) {
        return $query->where('vacation_grants.expires_at', '>', now());
    }
}
