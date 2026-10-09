<?php

namespace App\Models;

use App\Enums\SentinelTriggerType;
use App\Services\SentinelTriggerService;
use App\Support\LiveSyncBroadcaster;
use App\Traits\CustomModelTrait;
use App\Traits\PrecomputedTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class BaseModel extends Model {
    public function first(): never {
        throw new HttpException(500, 'You are calling first() on a model instance which is probably not what you want.');
    }

    use CustomModelTrait;
    use HasFactory;
    use PrecomputedTrait;

    public array $__pendingI18n = [];
    protected $appends          = ['icon', 'class'];

    protected static function booted() {
        static::created(function ($model) {
            SentinelTriggerService::handleModelBasedTrigger(SentinelTriggerType::OnCreated, $model);
        });

        static::updated(function ($model) {
            if (! $model->isPropagating) {
                SentinelTriggerService::handleModelBasedTrigger(SentinelTriggerType::OnUpdated, $model);
            }
        });

        static::deleted(function ($model) {
            SentinelTriggerService::handleModelBasedTrigger(SentinelTriggerType::OnDeleted, $model);
        });

        static::saved(function ($model) {
            LiveSyncBroadcaster::dispatchFor($model, $model->wasRecentlyCreated ? 'created' : 'updated');
        });
        static::deleted(function ($model) {
            LiveSyncBroadcaster::dispatchFor($model, 'deleted');
        });
    }
    public function withRequest() {
        if (($w = request('with'))) {
            $with    = explode(',', $w);
            $allowed = $this->allowedWith ?? [];
            if (count($allowed)) {
                $with = array_intersect($with, $allowed);
            }
            foreach ($with as $_) {
                $this->load($_);
            }
        }
        return $this;
    }
    public function newCollection(array $models = []) {
        return new BaseCollection($models);
    }
    public static function fromPath(?string $path, string $key = 'parent'): ?Model {
        if ($path === null) {
            return null;
        }
        $parts = explode('/', $path);
        if (count($parts) !== 2) {
            return null;
        }
        $className = 'App\\Models\\'.Str::studly(Str::singular($parts[0]));
        if (! is_subclass_of($className, Model::class)) {
            return null;
        }
        return $className::find($parts[1]);
    }
}
