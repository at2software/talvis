<?php

namespace App\Http\Controllers;

use App\Http\Requests\Focus\StoreAdminFocusRequest;
use App\Http\Requests\Focus\UpdateFocusRequest;
use App\Models\BaseModel;
use App\Models\Company;
use App\Models\Focus;
use App\Models\Param;
use App\Models\User;

class FocusController extends Controller {
    public function update(UpdateFocusRequest $request, Focus $focus) {
        $focus->applyAndSave($request);
        if ($path = request('parent_path')) {
            $newParent = BaseModel::fromPath($path);
            $focus->parent()->associate($newParent);
        }
        $focus->touch();
        return $focus;
    }
    public function store(StoreAdminFocusRequest $request) {
        $user      = User::find($request->validated('user_id'));
        $validated = $request->validated();
        $parent    = BaseModel::fromPath($validated['parent_path'] ?? null);
        return $user->foci()->create([
            'started_at'  => $validated['date'],
            'duration'    => $validated['duration'],
            'parent_type' => $parent ? get_class($parent) : Company::class,
            'parent_id'   => $parent ? $parent->getKey() : Param::get('ME_ID')->value,
        ]);
    }
    public function destroy(Focus $focus) {
        return response()->json($focus->delete());
    }
}
