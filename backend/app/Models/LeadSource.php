<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LeadSource extends BaseModel {
    use HasFactory;

    protected $fillable = ['name'];

    public function marketingInitiatives(): BelongsToMany {
        return $this->belongsToMany(MarketingInitiative::class, 'marketing_initiative_channels', 'lead_source_id', 'marketing_initiative_id')
            ->withPivot(['is_primary', 'custom_settings'])
            ->withTimestamps();
    }
    public function marketingProspects(): HasMany {
        return $this->hasMany(MarketingProspect::class);
    }
    public function getActiveInitiatives() {
        return $this->marketingInitiatives()
            ->where('status', 'active')
            ->get();
    }
    public function getTotalProspects(): int {
        return $this->marketingProspects()->count();
    }
    public function getProspectsCountByStatus(): array {
        return $this->marketingProspects()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status')
            ->toArray();
    }
    public function supportsFirefoxAddon(): bool {
        $supportedChannels = ['linkedin', 'xing', 'facebook', 'twitter'];
        return in_array(strtolower($this->name), $supportedChannels);
    }
}
