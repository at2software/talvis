<?php

namespace App\Http\Controllers;

use App\Enums\SentinelTriggerType;
use App\Models\Sentinel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class SentinelController extends Controller {
    public function index(Request $request) {
        $user = Auth::user();
        return $user->sentinels()->latest()->get();
    }
    public function indexActive(Request $request) {
        $query = Sentinel::select()
            ->where('trigger', SentinelTriggerType::Always)
            ->whereHas('subscribers', function (Builder $_) {
                $_->where('users.id', Auth::Id());
            });
        $triggers = [];
        foreach ($query->get() as $sentinel) {
            $items     = ['sentinel' => $sentinel, 'items' => []];
            $className = 'App\\Models\\'.Str::studly(Str::singular($sentinel->table_name));
            if (class_exists($className)) {
                $s = call_user_func($className.'::select');
                foreach ($s->get() as $m) {
                    $items['items'][] = $m;
                }
            }
            $triggers[] = $items;
        }
        return $triggers;
    }
    public function store(Request $request) {
        return Sentinel::Store();
    }
    public function update(Request $request, int $id) {
        return Sentinel::findOrFail($id)->applyAndSave($request);
    }
    public function show(Request $request, int $id) {
        return Sentinel::findOrFail($id);
    }
    public function destroy(Request $request, Sentinel $sentinel) {
        $sentinel->delete();
        return response()->json(true, 202);
    }
}
