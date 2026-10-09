<?php

namespace App\Support;

use App\Models\MarketingProspectActivity;
use App\Models\Project;
use Dedoc\Scramble\Contracts\OperationTransformer;
use Dedoc\Scramble\Support\Generator\Operation;
use Dedoc\Scramble\Support\RouteInfo;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use ReflectionNamedType;
use Throwable;

class SeededIdExamples implements OperationTransformer {
    private const SCALAR_IDS = [
        'projectId'  => Project::class,
        'activityId' => MarketingProspectActivity::class,
    ];

    private array $ids = [];

    public function handle(Operation $operation, RouteInfo $routeInfo): void {
        foreach ($operation->parameters as $parameter) {
            if ($parameter->in !== 'path') {
                continue;
            }
            $model = $this->boundModel($routeInfo, $operation->path, $parameter->name);
            $id    = $model ? $this->seededId($model, $operation->method === 'delete') : null;
            if ($id !== null) {
                $parameter->example($id);
            }
        }
    }
    private function boundModel(RouteInfo $routeInfo, string $path, string $name): ?string {
        foreach ($routeInfo->reflectionAction()?->getParameters() ?? [] as $parameter) {
            $type = $parameter->getType();
            if ($parameter->getName() === $name && $type instanceof ReflectionNamedType && is_subclass_of($type->getName(), Model::class)) {
                return $type->getName();
            }
        }
        if (isset(self::SCALAR_IDS[$name])) {
            return self::SCALAR_IDS[$name];
        }

        $segments = explode('/', $path);
        $index    = array_search('{'.$name.'}', $segments, true);
        if (! $index) {
            return null;
        }
        $class = 'App\\Models\\'.Str::studly(Str::singular($segments[$index - 1]));

        return is_subclass_of($class, Model::class) ? $class : null;
    }
    private function seededId(string $model, bool $last): int|string|null {
        $cacheKey = $model.($last ? ':last' : ':first');
        if (! array_key_exists($cacheKey, $this->ids)) {
            try {
                $instance              = new $model;
                $key                   = $instance->getRouteKeyName();
                $this->ids[$cacheKey]  = $instance->newQuery()->orderBy($key, $last ? 'desc' : 'asc')->value($key);
            } catch (Throwable) {
                $this->ids[$cacheKey] = null;
            }
        }

        return $this->ids[$cacheKey];
    }
}
