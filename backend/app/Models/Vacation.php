<?php

namespace App\Models;

use App\Enums\VacationState;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

class Vacation extends BaseModel {
    use HasFactory;
    use SoftDeletes;

    protected function casts(): array {
        return [
            'approved_at' => 'date',
            'started_at'  => 'date',
            'ended_at'    => 'date',
            'amount'      => 'double',
            'hpd'         => 'integer',
            'days'        => 'double',
            'state'       => VacationState::class,
        ];
    }

    protected $fillable = ['amount', 'started_at', 'log', 'ended_at', 'vacation_grant_id', 'comment', 'state', 'approved_at', 'approved_by_id'];

    public function firstDay(): Carbon {
        return Carbon::parse($this->started_at)->startOfDay();
    }
    public function endExclusive(): Carbon {
        return empty($this->ended_at)
            ? $this->firstDay()->addDays(max(1, (int)ceil(abs($this->amount) / 8)))
            : Carbon::parse($this->ended_at)->startOfDay()->addDay();
    }
    public function approved_by() {
        return $this->belongsTo(User::class, 'approved_by_id');
    }
    public function grant() {
        return $this->belongsTo(VacationGrant::class, 'vacation_grant_id');
    }
    public function user() {
        return $this->hasOneThrough(User::class, VacationGrant::class, 'id', 'id', 'vacation_grant_id', 'user_id');
    }
    public function scopeWithUserAndGrant($query) {
        return $query
            ->join('vacation_grants', 'vacations.vacation_grant_id', '=', 'vacation_grants.id')
            ->join('users', 'vacation_grants.user_id', '=', 'users.id')
            ->select([
                'vacations.*',
                'users.id as user_id',
                'users.name as user_name',
                'users.email as user_email',
                'vacation_grants.id as grant_id',
                'vacation_grants.name as grant_name',
                'vacation_grants.amount as grant_amount',
                'vacation_grants.expires_at as grant_expires_at',
            ]);
    }
    public function scopeSickNotes($query) {
        return $query->where('vacations.state', VacationState::Sick)
            ->whereNull('vacations.approved_at');
    }
    public function scopePendingRequests($query) {
        return $query->where('vacations.state', VacationState::Open);
    }
}
