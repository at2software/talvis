<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class M365MirrorItem extends Model {
    protected $table    = 'm365_mirror_items';
    protected $fillable = ['user_id', 'kind', 'source_id', 'external_id', 'hash'];
}
