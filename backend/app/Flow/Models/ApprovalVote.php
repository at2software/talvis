<?php

namespace App\Flow\Models;

use App\Models\BaseModel;
use App\Models\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApprovalVote extends BaseModel {
    public const UPDATED_AT = null;

    protected $table    = 'flow_approval_votes';
    protected $fillable = ['approval_id', 'user_id', 'decision', 'reason', 'selected_option'];
    protected $appends  = [];

    public function approval(): BelongsTo {
        return $this->belongsTo(Approval::class);
    }
    public function user(): BelongsTo {
        return $this->belongsTo(User::class);
    }
}
