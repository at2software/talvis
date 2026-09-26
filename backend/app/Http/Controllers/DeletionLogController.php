<?php

namespace App\Http\Controllers;

use App\Models\DeletionLog;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class DeletionLogController extends Controller {
    public function index(Request $request) {
        $q = DeletionLog::with(['user', 'restoredBy', 'context'])->latest();

        if ($type = $request->input('model_type')) {
            $q->where('model_type', Str::start($type, 'App\\Models\\'));
        }
        if ($userId = $request->input('user_id')) {
            $q->where('user_id', $userId);
        }
        if ($from = $request->input('from')) {
            $q->whereDate('created_at', '>=', $from);
        }
        if ($to = $request->input('to')) {
            $q->whereDate('created_at', '<=', $to);
        }
        if ($search = $request->input('q')) {
            $q->where('label', 'like', '%'.$search.'%');
        }
        return $q->paginate(intval($request->input('per_page', 50)));
    }
    public function indexModelTypes() {
        return DeletionLog::distinct()->orderBy('model_type')->pluck('model_type')->map(fn ($_) => class_basename($_))->values();
    }
    public function restore(DeletionLog $deletionLog) {
        if (! $deletionLog->restoreModel()) {
            abort(409, 'This entry cannot be restored - it was already restored or deleted permanently.');
        }
        return $deletionLog->fresh(['user', 'restoredBy', 'context']);
    }
}
