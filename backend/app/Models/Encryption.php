<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class Encryption extends BaseModel {
    use HasFactory;

    protected $fillable = ['key', 'value', 'user_id', 'my_id'];
    protected $hidden   = ['created_at', 'updated_at', 'user_id', 'icon', 'class'];

    public function user() {
        return $this->belongsTo(User::class);
    }
    public static function userFor(string $key, string $myId): ?User {
        return $myId === '' ? null : static::where('key', $key)->where('my_id', $myId)->first()?->user;
    }
}
