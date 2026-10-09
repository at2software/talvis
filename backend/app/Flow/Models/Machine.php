<?php

namespace App\Flow\Models;

use App\Flow\MachineAbility;
use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\HasApiTokens;

class Machine extends Model implements AuthenticatableContract {
    use Authenticatable;
    use HasApiTokens;

    protected $table    = 'flow_machines';
    protected $fillable = ['name'];

    public function tokenName(): ?string {
        return $this->currentAccessToken()?->name;
    }
    public function hasAbility(string $ability): bool {
        $abilities = $this->currentAccessToken()?->abilities ?? [];
        return MachineAbility::isGrantable($ability) && in_array($ability, $abilities, true);
    }
}
