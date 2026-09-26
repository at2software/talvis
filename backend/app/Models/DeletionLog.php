<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

class DeletionLog extends BaseModel {
    protected $fillable        = ['user_id', 'model_type', 'model_id', 'context_type', 'context_id', 'label', 'payload', 'meta', 'is_restorable', 'restored_at', 'restored_by_id'];
    private static bool $muted = false;

    protected function casts(): array {
        return [
            'payload'       => 'array',
            'meta'          => 'array',
            'is_restorable' => 'boolean',
            'restored_at'   => 'datetime',
        ];
    }
    public function user() {
        return $this->belongsTo(User::class);
    }
    public function restoredBy() {
        return $this->belongsTo(User::class, 'restored_by_id');
    }
    public function model(): MorphTo {
        return $this->morphTo();
    }
    public function context(): MorphTo {
        return $this->morphTo();
    }
    public static function withoutLogging(callable $callback): mixed {
        $previous    = self::$muted;
        self::$muted = true;
        try {
            return $callback();
        } finally {
            self::$muted = $previous;
        }
    }
    public static function record(Model $model): ?self {
        if (self::$muted) {
            return null;
        }
        $context     = $model->deletionContext();
        $softDeletes = $model::isSoftDeletable();

        return self::create([
            'user_id'       => Auth::id(),
            'model_type'    => $model::class,
            'model_id'      => $model->getKey(),
            'context_type'  => $context ? $context::class : null,
            'context_id'    => $context?->getKey(),
            'label'         => self::plainLabel($model->deletionLabel()),
            'payload'       => $model->getAttributes(),
            'meta'          => $model->deletionMeta(),
            'is_restorable' => $softDeletes && ! (method_exists($model, 'isForceDeleting') && $model->isForceDeleting()),
        ]);
    }
    private static function plainLabel(string $label): string {
        return Str::limit(trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($label)))), 250);
    }
    public function restoreModel(): bool {
        if (! $this->is_restorable || $this->restored_at) {
            return false;
        }
        $class = $this->model_type;
        if (! class_exists($class) || ! $class::isSoftDeletable()) {
            return false;
        }
        $model = $class::withTrashed()->find($this->model_id);
        if (! $model || ! $model->trashed()) {
            return false;
        }
        $model->restore();
        $model->afterDeletionRestore($this->meta ?? []);

        $this->restored_at    = now();
        $this->restored_by_id = Auth::id();
        $this->save();
        return true;
    }
}
