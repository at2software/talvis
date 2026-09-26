<?php

namespace App\Traits;

use App\Models\DeletionLog;
use Illuminate\Database\Eloquent\Model;

trait LogsDeletionTrait {
    protected static function bootLogsDeletionTrait(): void {
        static::deleting(function ($model) {
            DeletionLog::record($model);
        });
    }
    public function deletionLabel(): string {
        return $this->name ?: class_basename($this).' #'.$this->getKey();
    }
    public function deletionMeta(): array {
        return [];
    }
    public function deletionContext(): ?Model {
        return null;
    }
    public function afterDeletionRestore(array $meta): void {}
}
