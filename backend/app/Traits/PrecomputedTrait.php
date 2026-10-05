<?php

namespace App\Traits;

use App\Casts\Precomputed;
use Illuminate\Support\Str;

class PropagationState {
    public static bool $isPropagating = true;
}

trait PrecomputedTrait {
    protected bool $isPropagating = false;

    protected static function bootPrecomputedTrait(): void {
        static::deleted(function ($_) {
            $_->propagateDirty();
        });
        static::saved(function ($_) {
            $_->propagateDirty();
        });
    }
    public static function disablePropagation() {
        PropagationState::$isPropagating = false;
    }
    public static function enablePropagation() {
        PropagationState::$isPropagating = true;
    }
    public function propagateDirty() {
        $this->resetPrecomputedAttributes();

        foreach ($this->touches as $parent) {
            if ($this->$parent) {
                $this->$parent->propagateDirty();
            }
        }
    }
    public function getPrecomputedAttributes() {
        return array_filter(array_keys($this->casts), fn ($key) => is_a($this->casts[$key], Precomputed::class, true));
    }
    public function resetPrecomputedAttributes() {
        if ($this->isPropagating || ! PropagationState::$isPropagating) {
            return;
        }
        $this->isPropagating = true;

        $attributes = $this->getPrecomputedAttributes();

        foreach ($attributes as $key) {
            $methodName = 'precompute'.Str::ucfirst(Str::camel($key)).'Attribute';
            if (method_exists($this, $methodName)) {
                $this->$key = $this->{$methodName}($key);
            }
        }

        if (count($attributes)) {
            $this->save();
        }
        $this->isPropagating = false;
    }
}
