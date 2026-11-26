<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;

class AssignmentRole extends BaseModel {
    use HasFactory;

    public const PROJECT_MANAGER      = 'project manager';
    public const DEVELOPER            = 'developer';
    public const LEAD_DEVELOPER       = 'lead developer';
    public const SECURITY             = 'security';
    public const UI_UX                = 'ui/ux';
    public const EXTERNAL_CONTRIBUTOR = 'external contributor';
    public const CUSTOMER             = 'customer';
    public const RESPONSIBLE          = [self::LEAD_DEVELOPER, self::SECURITY, self::UI_UX];
    public const EXTERNAL             = [self::CUSTOMER, self::EXTERNAL_CONTRIBUTOR];
    public const GLOBAL_ROLE          = [self::LEAD_DEVELOPER => 'dev', self::SECURITY => 'dev', self::UI_UX => 'design'];

    protected $fillable = ['name'];

    public function assignments() {
        return $this->belongsToMany(Assignment::class)->with('assignee');
    }
}
