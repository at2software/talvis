<?php

namespace App\Http\Controllers;

use App\Http\Requests\Param\StoreRequest;
use App\Models\FloatParam;
use App\Models\Param;
use App\Models\StringParam;
use App\Models\TextParam;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;

class ParamController extends Controller {
    private function paramFor($key, $type, $id): ?Model {
        if (! $key) {
            return null;
        }
        if (! $type || ! $id) {
            return Param::get($key);
        }
        if ($type && ! $id) {
            return Param::get($key, ['type' => $type]);
        }
        $str = '\\App\Models\\'.Str::ucfirst(Str::singular($type));
        if (class_exists($str)) {
            return $str::findOrFail($id)->param($key);
        }
        return null;
    }
    private function multiKeyHistory(string $keys, callable $paramResolver) {
        $keyArray = str_contains($keys, ',')
            ? array_map('trim', explode(',', $keys))
            : [$keys];

        $result = [];

        foreach ($keyArray as $singleKey) {
            $param = $paramResolver($singleKey);
            if ($param) {
                $historyResponse = $param->historyResponse();
                if ($historyResponse instanceof JsonResponse) {
                    $result[] = $historyResponse->getData(true);
                } elseif ($historyResponse instanceof Response) {
                    $result[] = json_decode($historyResponse->getContent(), true);
                } else {
                    $result[] = $historyResponse;
                }
            }
        }
        return response()->json($result);
    }
    public function show($key, $type = null, $id = null) {
        return ($this->paramFor($key, $type, $id) ?? abort(404))->append('value');
    }
    public function history($key, $type = null, $id = null) {
        return $this->multiKeyHistory($key, fn ($singleKey) => $this->paramFor($singleKey, $type, $id));
    }
    public function store(StoreRequest $request, $key, $type = null, $id = null) {
        $this->authorizeWrite($key);
        return $this->saveParam($key, $type, $id, $request->validated('value'));
    }
    public function update($key, $type = null, $id = null) {
        $this->authorizeWrite($key);
        $value = request('value');
        if ($value === null) {
            $this->paramFor($key, $type, $id)?->delete();
            return ($this->paramFor($key, $type, $id) ?? abort(404))->append('value');
        }
        return $this->saveParam($key, $type, $id, $value);
    }
    public function destroy($key, $type = null, $id = null) {
        $this->authorizeWrite($key);
        ($this->paramFor($key, $type, $id) ?? abort(404))->delete();
        return response()->noContent();
    }
    private function authorizeWrite(string $key): void {
        abort_unless(Param::isWritableBy($key, request()->user()), 403);
    }
    private function saveParam($key, $type, $id, $value) {
        if ($type === null) {
            $type = StringParam::class;
            if (is_array($value)) {
                $type = TextParam::class;
            } elseif (is_numeric($value)) {
                $type = FloatParam::class;
            } elseif (strlen($value) > 50) {
                $type = TextParam::class;
            }
        }
        $model        = $this->paramFor($key, $type, $id) ?? abort(404);
        $model->value = $value;
        $model->save();
        return $model;
    }
    public static function getRoute($c) {
        Route::group(['prefix' => '{_}/params'], function () use ($c) {
            Route::get('{key}/history', function ($_, $key) use ($c) {
                $controller = new ParamController;
                $model      = $c::findOrFail($_);
                return $controller->multiKeyHistory($key, fn ($singleKey) => $model->param($singleKey, request('fallback', false)));
            });
            Route::get('/{key}', fn ($_, $key) => $c::findOrFail($_)->param($key, request('fallback', false)))->where('key', '[^,]+');
            Route::post('{key}', function ($_, $key) use ($c) {
                $model = $c::findOrFail($_);
                $param = $model->param($key, false);
                if ($param) {
                    $param->value = request('value');
                    $param->save();
                }
                return $model->param($key, true)->append('value')->append('fallback');
            })->where('key', '[^,]+');
            Route::put('{key}', function ($_, $key) use ($c) {
                $model = $c::findOrFail($_);
                $value = request('value');
                $param = $model->param($key, false);

                if ($value === null) {
                    $param?->delete();
                } elseif ($param) {
                    $param->value = $value;
                    $param->save();
                }
                return $model->param($key, true)->append('value')->append('fallback');
            })->where('key', '[^,]+');
            Route::delete('{key}', fn ($_, $key) => response()->json($c::findOrFail($_)->param($key, request('fallback', false))->delete()))->where('key', '[^,]+');
        });
    }
}
