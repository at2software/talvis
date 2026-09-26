<?php

namespace App\Traits;

use App\Models\FloatParam;
use App\Models\Param;
use App\Models\StringParam;
use App\Models\TextParam;
use Illuminate\Database\Eloquent\Relations\HasOne;

trait HasParams {
    protected $params   = [];
    public static $WITH = ['latestFloatParams', 'latestStringParams', 'latestTextParams'];

    public function initializeHasParams() {
        $this->hidden = array_unique(array_merge($this->hidden ?? [], self::$WITH));
        if ($this->eagerLoadParams ?? false) {
            $this->with = array_unique(array_merge($this->with ?? [], self::$WITH));
        }
    }

    public function floatParams() {
        return $this->hasMany(FloatParam::class, 'parent_id')->where('parent_type', $this::class);
    }
    public function stringParams() {
        return $this->hasMany(StringParam::class, 'parent_id')->where('parent_type', $this::class);
    }
    public function textParams() {
        return $this->hasMany(TextParam::class, 'parent_id')->where('parent_type', $this::class);
    }

    public function latestFloatParams($orderBy = 'id') {
        return $this->floatParams()->pickLatestWithConditions('param_id', $this::class, $orderBy)->with('base');
    }
    public function latestStringParams($orderBy = 'id') {
        return $this->stringParams()->pickLatestWithConditions('param_id', $this::class, $orderBy)->with('base');
    }
    public function latestTextParams($orderBy = 'id') {
        return $this->textParams()->pickLatestWithConditions('param_id', $this::class, $orderBy)->with('base');
    }
    public function getParamsAttribute() {
        return collect()
            ->merge($this->latestFloatParams)
            ->merge($this->latestStringParams)
            ->merge($this->latestTextParams)
            ->mapWithKeys(fn ($param) => [$param->base->key => $param->value]);
    }
    public function param($key, $fallback = false) {
        $param = Param::get($key)?->linkTo($this, $fallback);
        $param->append('value');
        $param->append('fallback');
        $param->parent_path = $this->path;
        return $param;
    }
    public function latestRevenue12Param() {
        return $this->latestParamFor('INVOICE_REVENUE_12M')->whereAfter(now()->subYear(), 'created_at');
    }
    public function latestParamFor(string $key): HasOne {
        $param = Param::get($key, doNotCreate: true);
        if (! $param) {
            return $this->hasOne(FloatParam::class, 'parent_id')->whereRaw('0 = 1'); // fallback
        }

        $type = $param->type;
        return $this->hasOne($type, 'parent_id')
            ->where('parent_type', $this->getMorphClass())
            ->where('param_id', $param->id)
            ->latest('created_at');
    }
    public static function getRelationMethod($model): ?string {
        if ($model === FloatParam::class) {
            return 'floatParams';
        }
        if ($model === StringParam::class) {
            return 'stringParams';
        }
        if ($model === TextParam::class) {
            return 'textParams';
        }
        return null;
    }
}

trait HasParamsBuilder {
    public function withLatestParams() {
        return $this->with('latestFloatParams', 'latestStringParams', 'latestTextParams');
    }
}
