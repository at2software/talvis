<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Precomputed implements CastsAttributes {
    public function get(Model $model, string $key, mixed $value, array $attributes): mixed {
        $rawValue = $model->getRawOriginal($key);

        if ($rawValue !== null) {
            return floatval($rawValue); // nothing to do here
        }
        if (! empty($model->$key)) {
            return $model->$key;
        }
        $methodName = 'precompute'.Str::ucfirst(Str::camel($key)).'Attribute';
        if (! method_exists($model, $methodName)) {
            return $rawValue;
        }
        $newValue = $model->{$methodName}($key);

        DB::table($model->getTable())->where('id', $model->getKey())->update([$key => $newValue]);
        $model->setAttribute($key, $newValue);
        $model->syncOriginalAttribute($key);
        return floatval($newValue);
    }
    public function set(Model $model, string $key, mixed $value, array $attributes): mixed {
        return $value;
    }
}
