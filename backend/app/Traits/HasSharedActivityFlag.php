<?php

namespace App\Traits;

use Illuminate\Database\Eloquent\Casts\Attribute;

trait HasSharedActivityFlag {
    public const FLAG_SHARED = 1 << 0;

    protected function isShared(): Attribute {
        return Attribute::make(
            get: fn () => (bool)$this->getFlag(self::FLAG_SHARED),
            set: function (bool $shared) {
                $shared ? $this->setFlag(self::FLAG_SHARED) : $this->unsetFlag(self::FLAG_SHARED);
                return ['flags' => $this->attributes['flags']];
            }
        );
    }
}
