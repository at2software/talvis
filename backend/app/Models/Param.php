<?php

namespace App\Models;

use App\Helpers\NLog;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\DB;

class Param extends BaseModel {
    protected $fillable = ['key', 'value', 'has_history', 'type'];

    protected function casts(): array {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    private $model               = null;
    private $fallback            = false;
    private $fallen_back         = false;
    private $pending_value       = null;
    private $pending_created_at  = null;
    private $pending_updated_at  = null;
    private $has_pending_changes = false;
    private static $paramCache   = [];
    private $cached_value        = null;
    private $has_cached_value    = false;
    public $parent_path          = null;

    public function latestFor($poly): ?HasOne {
        $subQuery = $this->type::select('id')->where($poly)->latest()->limit(1);
        return $this->hasOne($this->type)->whereIn($subQuery);
    }
    protected function dataForPoly($poly) {
        return $this->hasOne($this->type)->where($poly)->latest();
    }
    protected function historyDataForPoly($poly): HasMany {
        return $this->hasMany($this->type)->where($poly);
    }
    public function historyResponse() {
        if (! request()->user()->hasAnyRole(['admin', 'financial'])) {
            return response('No permissions to query param history', 403);
        }

        $since    = request('since');
        $cluster  = request('cluster');
        $response = ['name' => $this->key, 'current' => $this->value ?? 0];

        $query = $this->history();
        if (! $query) {
            return $response;
        }

        if ($since) {
            $query->where('created_at', '>', Carbon::createFromTimestamp($since));
        }

        $maxUpdatedAt = $query->max('updated_at');
        $maxUpdatedAt = $maxUpdatedAt ? Carbon::parse($maxUpdatedAt) : null;

        if ($cluster && ($dateFormat = Param::dateFormatFor($cluster))) {
            $data = $query->selectRaw('
                DATE_FORMAT(created_at, ?) AS x,
                value AS y,
                MIN(value) AS min,
                MAX(value) AS max,
                created_at
            ', [$dateFormat])
                ->groupBy('x')
                ->orderBy('created_at')
                ->get()
                ->map(fn ($item) => [
                    'x'   => $item->x,
                    'y'   => (float)$item->y,
                    'min' => (float)$item->min,
                    'max' => (float)$item->max,
                ]);
        } else {
            $data = $query->select(['created_at', 'value'])
                ->orderBy('created_at')
                ->get()
                ->map(fn ($item) => [
                    'x'   => $item->created_at->toISOString(),
                    'y'   => (float)$item->value,
                    'min' => (float)$item->value,
                    'max' => (float)$item->value,
                ]);
        }

        $response['data'] = $data->toArray();
        return $response;
    }
    public function linkTo($model, $fallback = true): static {
        $clone           = clone $this;
        $clone->model    = $model;
        $clone->fallback = $fallback;
        $clone->forgetCachedValue();
        return $clone;
    }
    public function getFallbackAttribute() {
        $this->value;
        return $this->fallen_back;
    }
    protected function value(): Attribute {
        return Attribute::make(
            get: function () {
                if ($this->has_pending_changes && $this->pending_value !== null) {
                    return $this->pending_value;
                }

                if (! $this->has_cached_value) {
                    // Use ->first()?->value to ensure Eloquent casts (like I18n) are applied
                    $d = $this->getRel()?->first()?->value ?? null;
                    if (empty($d) && $this->fallback) {
                        $this->fallen_back = true;
                        $d                 = $this->dataForPoly(self::nullPoly())?->first()?->value ?? null;
                    }
                    if ($d === null && ($this->fallback || ! $this->model)) {
                        $d = self::defaultFor($this->key);
                    }
                    $this->cached_value     = $d;
                    $this->has_cached_value = true;
                }
                return $this->cached_value;
            },
            set: function ($value) {
                $this->pending_value       = $value;
                $this->has_pending_changes = true;
                $this->forgetCachedValue();
            }
        );
    }
    protected function createdAt(): Attribute {
        return Attribute::make(
            get: function () {
                return $this->pending_created_at ?? $this->getRel()?->value('created_at');
            },
            set: function ($value) {
                $this->pending_created_at  = $value;
                $this->has_pending_changes = true;
            }
        );
    }
    protected function updatedAt(): Attribute {
        return Attribute::make(
            get: function () {
                return $this->pending_updated_at ?? $this->getRel()?->value('updated_at');
            },
            set: function ($value) {
                $this->pending_updated_at  = $value;
                $this->has_pending_changes = true;
            }
        );
    }
    public function history(): ?HasMany {
        return $this->getRel(true);
    }
    public function setCreatedAt($value) {
        $this->attributes[$this->getCreatedAtColumn()] = $this->fromDateTime($value);
        return $this;
    }
    public function setUpdatedAt($value) {
        $this->attributes[$this->getUpdatedAtColumn()] = $this->fromDateTime($value);
        return $this;
    }
    public function save(array $options = []): bool {
        $writesValue = $this->has_pending_changes && $this->pending_value !== null;
        if ($writesValue) {
            if ($this->has_history) {
                $this->createNewWithPending();
            } else {
                if ($data = $this->getRel()?->first()) {
                    $data->value = $this->pending_value;
                    if ($this->pending_created_at) {
                        $data->created_at = $this->pending_created_at;
                    }
                    if ($this->pending_updated_at) {
                        $data->updated_at = $this->pending_updated_at;
                    }
                    $data->save();
                } else {
                    $this->createNewWithPending();
                }
            }
        }

        $this->clearPendingChanges();
        return $writesValue || parent::save($options);
    }
    public function delete() {
        if ($this->model && $data = $this->getRel(false)?->first()) {
            return $data->delete();
        }

        return parent::delete();
    }
    public function getDirty() {
        $dirty = parent::getDirty();
        unset($dirty['value'], $dirty['created_at'], $dirty['updated_at']);
        return $dirty;
    }
    private function clearPendingChanges(): void {
        $this->pending_value       = null;
        $this->pending_created_at  = null;
        $this->pending_updated_at  = null;
        $this->has_pending_changes = false;
    }
    private function forgetCachedValue(): void {
        $this->cached_value     = null;
        $this->has_cached_value = false;
    }
    private function getRel($history = false) {
        $relation = $history ? 'historyDataForPoly' : 'dataForPoly';
        if ($this->model) {
            if ($this->$relation($this->model->toPoly())->exists()) {
                return $this->$relation($this->model->toPoly());
            } elseif ($this->fallback) {
                $this->fallen_back = true;
                return $this->$relation(self::nullPoly());
            }
            return null;
        } else {
            return $this->$relation(self::nullPoly());
        }
    }
    private function createNew($value) {
        $poly = $this->model ? $this->model->toPoly() : [];
        return $this->type::create(['value' => $value, 'param_id' => $this->id, ...$poly]);
    }
    private function createNewWithPending() {
        $poly = $this->model ? $this->model->toPoly() : [];
        $data = ['value' => $this->pending_value, 'param_id' => $this->id, ...$poly];

        if ($this->pending_created_at) {
            $data['created_at'] = $this->pending_created_at;
        }
        if ($this->pending_updated_at) {
            $data['updated_at'] = $this->pending_updated_at;
        }
        return $this->type::create($data);
    }
    public static function get($key, $attrs = [], $doNotCreate = false): ?Param {
        if (! empty(self::$paramCache[$key])) {
            return self::$paramCache[$key];
        }
        $param = Param::where('key', $key)->first();
        if (! $param && ! $doNotCreate) {  // key does not exist yet - create new
            $type        = null;
            $has_history = isset($attrs['history']) ? $attrs['history'] : true;
            if (isset($attrs['type'])) {
                $type = $attrs['type'];
            } else {
                $keys = config('params');
                if (! empty($keys[$key])) {
                    $type        = $keys[$key]['type'];
                    $has_history = $keys[$key]['history'];
                } else {
                    $type        = StringParam::class;
                    $has_history = true;
                    NLog::warning("accessing unknown Param key `$key` without providing a type. Assuming $type with history, but you should better add to config('params') before deploying!");
                }
            }
            $param = Param::createOrFirst(['key' => $key], ['has_history' => $has_history, 'type' => $type]);
        }
        self::$paramCache[$key] = $param;   // save for later use
        return $param;
    }
    public static function put(string $key, $value): void {
        $param        = self::get($key);
        $param->value = $value ?? '';
        $param->save();
        unset(self::$paramCache[$key]);
    }
    public static function incrementNumber(string $key, int $by = 1): int {
        return DB::transaction(function () use ($key, $by) {
            $param = self::get($key);
            self::whereKey($param->id)->lockForUpdate()->value('id');
            $param->forgetCachedValue();
            $param->value = (int)$param->value + $by;
            $param->save();
            return (int)$param->value;
        });
    }
    public static function isStored(string $key): bool {
        return (bool)self::get($key)->history()?->exists();
    }
    public static function index($poly = null): array {
        if ($poly === null) {
            $poly = self::nullPoly();
        }

        $data = [];

        if (is_null($poly['parent_id']) && is_null($poly['parent_type'])) {
            $floatResults = FloatParam::getLatestGlobalValuesWithKeys();
            foreach ($floatResults as $result) {
                $data[$result->key] = (float)$result->value;
            }

            $stringResults = StringParam::getLatestGlobalValuesWithKeys();
            foreach ($stringResults as $result) {
                $data[$result->key] = $result->value;
            }

            $textResults = TextParam::getLatestGlobalValuesWithKeys();
            foreach ($textResults as $result) {
                $data[$result->key] = $result->value;
            }

            foreach (config('params') as $key => $definition) {
                if (! array_key_exists($key, $data) && isset($definition['default'])) {
                    $data[$key] = $definition['type'] === FloatParam::class ? (float)$definition['default'] : $definition['default'];
                }
            }
        } else {
            $floatResults = FloatParam::getLatestValuesWithKeys($poly);
            foreach ($floatResults as $result) {
                $data[$result->key] = (float)$result->value;
            }

            $stringResults = StringParam::getLatestValuesWithKeys($poly);
            foreach ($stringResults as $result) {
                $data[$result->key] = $result->value;
            }

            $textResults = TextParam::getLatestValuesWithKeys($poly);
            foreach ($textResults as $result) {
                $data[$result->key] = $result->value;
            }
        }
        return $data;
    }
    public static function isWritableBy(string $key, User $user): bool {
        return $user->hasAnyRole(config('params')[$key]['roles'] ?? 'admin');
    }
    public static function defaultFor(string $key): mixed {
        return config('params')[$key]['default'] ?? null;
    }
    public static function toDictionary($paramArray): array {
        $dictionary = [];
        foreach ($paramArray as $param) {
            $dictionary[$param->key] = $param->value;
        }
        return $dictionary;
    }
    public static function dateFormatFor(?string $descriptiveString): ?string {
        switch ($descriptiveString) {
            case 'day': return '%Y-%m-%d';
            case 'month': return '%Y-%m-01';
            case 'year': return '%Y-01-01';
            default: return null;
        }
    }
    public function localizedValue(?string $language = 'de', ?string $formality = 'formal'): ?string {
        return self::localizeI18nValue($this->value, $language, $formality);
    }
    public static function localizeI18nValue($value, ?string $language = 'de', ?string $formality = 'formal'): ?string {
        if (! is_array($value)) {
            return $value;
        }

        foreach ($value as $variant) {
            if (($variant['language'] ?? '') === $language && ($variant['formality'] ?? '') === $formality) {
                return $variant['text'] ?? '';
            }
        }

        foreach ($value as $variant) {
            if (($variant['language'] ?? '') === 'de' && ($variant['formality'] ?? '') === 'formal') {
                return $variant['text'] ?? '';
            }
        }

        return $value[0]['text'] ?? '';
    }
}
