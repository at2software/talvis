<?php

namespace App\Models;

use App\Enums\SentinelTriggerType;
use App\Jobs\ChatSendMessageJob;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class Sentinel extends BaseModel {
    use HasFactory;

    protected $fillable = ['name', 'trigger', 'table_name', 'trigger_variable', 'condition', 'result', 'user_id'];
    protected $appends  = ['subscribers'];

    protected function casts(): array {
        return ['trigger' => SentinelTriggerType::class];
    }
    public function getSubscribersAttribute() {
        return $this->subscribers()->get();
    }
    public function subscribers() {
        return $this->belongsToMany(User::class, 'sentinel_users');
    }
    public function user() {
        return $this->belongsTo(User::class);
    }
    public static function Store() {
        $user = Auth::user();
        $new  = new Sentinel([
            'name'       => 'new sentinel',
            'table_name' => 'users',
            'condition'  => '[]',
            'result'     => '[]',
            'user_id'    => $user->id,
        ]);
        $new->save();
        $user->subscribedSentinels()->attach($new);    // always assign creator as subscriber
        return $new;
    }
    public function matchesModelConditions(Model $model, array $originalValues = []): bool {
        if (! $this->isModelBased()) {
            return false;
        }

        $conditions = json_decode($this->condition);
        if (count($conditions) == 0) {
            return true;
        }

        $triggerVar = $this->trigger_variable ?? 'model';

        foreach ($conditions as $conditionColumn) {
            $columnPasses = true;
            foreach ($conditionColumn as $condition) {
                $operator = $condition->key;
                $inverted = $condition->inverted ?? false;
                if (! isset($condition->options)) {
                    continue;
                }

                $options = collect($condition->options);
                $column  = $options->firstWhere('key', 'column')->value ?? null;
                $input   = $options->firstWhere('key', 'input')->value ?? null;

                $column = $this->stripVariablePrefix($column, $triggerVar);

                if (preg_match('/^\{(.+)\}$/', $input, $matches)) {
                    $input = $matches[1];
                    $input = $this->stripVariablePrefix($input, $triggerVar);
                    $input = data_get($model, $input);
                }

                $value    = data_get($model, $column);
                $oldValue = data_get($originalValues, $column);

                $result = true;

                switch ($operator) {
                    case 'null':
                        $result = is_null($value);
                        break;
                    case 'not_null':
                        $result = ! is_null($value);
                        break;
                    case 'false':
                        $result = $value === false || $value === 0 || $value === '0';
                        break;
                    case 'true':
                        $result = $value === true || $value === 1 || $value === '1';
                        break;
                    case 'greater':
                        $result = $value > $input;
                        break;
                    case 'less':
                        $result = $value < $input;
                        break;
                    case 'equal':
                        $result = $value == $input;
                        break;
                    case 'not_equal':
                        $result = $value != $input;
                        break;
                    case 'contains':
                        $result = stripos($value, $input) !== false;
                        break;
                    case 'starts_with':
                        $result = stripos($value, $input) === 0;
                        break;
                    case 'ends_with':
                        $result = substr($value, -strlen($input)) === $input;
                        break;
                    case 'was_equal':
                        $result = $oldValue == $input;
                        break;
                    case 'was_not_equal':
                        $result = $oldValue != $input;
                        break;
                    case 'changed':
                        $result = $oldValue != $value;
                        break;
                    case 'changed_to':
                        $result = $oldValue != $value && $value == $input;
                        break;
                    case 'changed_from':
                        $result = $oldValue != $value && $oldValue == $input;
                        break;
                    default:
                        $result = false;
                }
                if ($inverted) {
                    $result = ! $result;
                }
                if (! $result) {
                    $columnPasses = false;
                    break;
                }
            }
            if ($columnPasses) {
                return true;
            }
        }
        return false;
    }
    public function matchesScheduleConditions(\DateTimeInterface $now): bool {
        if ($this->trigger !== SentinelTriggerType::OnSchedule) {
            return false;
        }

        $conditions = json_decode($this->condition);

        foreach ($conditions as $condition) {
            $operator = $condition->key;
            $options  = collect($condition->options);

            switch ($operator) {
                case 'day_in_month':
                    $input = (int)$options->firstWhere('key', 'input')->value;
                    $day   = (int)$now->format('j');

                    if ($input < 0) {
                        $daysInMonth = (int)$now->format('t');
                        if ($day !== ($daysInMonth + 1 + $input)) {
                            return false;
                        }
                    } elseif ($day !== $input) {
                        return false;
                    }
                    break;

                case 'month':
                    $input = (int)$options->firstWhere('key', 'input')->value;
                    if ((int)$now->format('n') !== $input) {
                        return false;
                    }
                    break;

                case 'weekday':
                    $input   = (int)$options->firstWhere('key', 'input')->value;
                    $weekday = (int)$now->format('N');
                    if ($weekday !== $input) {
                        return false;
                    }

                    $byOccurrence = filter_var($options->firstWhere('key', 'by_occurence_in_month')->value ?? false, FILTER_VALIDATE_BOOLEAN);
                    if ($byOccurrence) {
                        $occurrenceInput = (int)$options->firstWhere('key', 'occurence_in_month')->value;
                        $occurrence      = $this->getWeekdayOccurrenceInMonth($now);
                        if ($occurrence !== $occurrenceInput) {
                            return false;
                        }
                    }
                    break;

                default:
                    return false;
            }
        }
        return true;
    }
    private function getWeekdayOccurrenceInMonth(\DateTimeInterface $date): int {
        $day = (int)$date->format('j');
        return (int)ceil($day / 7);
    }
    public function execute(?Model $model, array $originalValues = []): bool {
        $commands = json_decode($this->result);
        foreach ($commands as $command) {
            $this->executeAction($command, $model, $originalValues);
        }
        return true;
    }
    private function executeAction(object $command, ?Model $model, array $originalValues, ?Model $item = null, string $variable = 'item'): void {
        $action = $command->key;
        if (! isset($command->options)) {
            return;
        }

        $options     = collect($command->options);
        $interpolate = fn ($val) => $item
            ? $this->interpolateNested($val, $model, $item, $variable, $originalValues)
            : $this->interpolate($val, $model, $originalValues);

        switch ($action) {
            case 'set_value':
                if ($this->trigger === SentinelTriggerType::OnDeleted || ! $model) {
                    break;
                }
                $target = $item ?? $model;
                $column = $options->firstWhere('key', 'column')->value ?? null;
                $input  = $interpolate($options->firstWhere('key', 'input')->value ?? '');
                if ($column !== null) {
                    $target->{$column} = $input;
                    $target->save();
                }
                break;

            case 'for_each':
                $relationPath     = $options->firstWhere('key', 'relation')->value ?? null;
                $nestedVariable   = $options->firstWhere('key', 'variable')->value ?? 'item';
                $nestedConditions = $command->conditions ?? [];
                $nestedActions    = $command->actions ?? [];

                if (! $relationPath || ! $model) {
                    break;
                }

                // Strip trigger variable prefix from relation path (e.g., pps.project.assignees -> project.assignees)
                $triggerVar = $this->trigger_variable ?? 'model';
                $relation   = $this->stripVariablePrefix($relationPath, $triggerVar);

                $collection = $this->resolveRelation($model, $relation);
                if (! $collection) {
                    break;
                }

                foreach ($collection as $loopItem) {
                    if (! $this->matchesNestedConditions($nestedConditions, $loopItem, $model, $originalValues, $nestedVariable)) {
                        continue;
                    }
                    foreach ($nestedActions as $nestedAction) {
                        $this->executeAction($nestedAction, $model, $originalValues, $loopItem, $nestedVariable);
                    }
                }
                break;

            case 'create_new':
                $table      = $options->firstWhere('key', 'table')->value ?? null;
                $fieldsJson = $options->firstWhere('key', 'fields')->value ?? '{}';

                if (! $table) {
                    break;
                }

                $modelClass = 'App\\Models\\'.Str::studly(Str::singular($table));
                if (! class_exists($modelClass)) {
                    break;
                }

                $fields = json_decode($fieldsJson, true);
                if (! is_array($fields)) {
                    break;
                }

                $data = [];
                foreach ($fields as $key => $value) {
                    $data[$key] = $interpolate($value);
                }

                $newModel = new $modelClass;
                $newModel->fill($data)->save();
                break;

            case 'mattermost_post':
            case 'slack_post':
                $channel_id = $options->firstWhere('key', 'channel_id')->value ?? null;
                $message    = $interpolate($options->firstWhere('key', 'message')->value ?? '');
                if ($channel_id && $message) {
                    ChatSendMessageJob::dispatch($message, channelId: $channel_id, chatKey: strstr($action, '_post', true));
                }
                break;

            case 'webhook':
                $endpoint = WebhookEndpoint::where('is_active', true)->find($options->firstWhere('key', 'endpoint')->value ?? null);
                $template = trim((string)($options->firstWhere('key', 'payload')->value ?? ''));
                $data     = $template !== ''
                    ? $this->interpolateJson(json_decode($template, true), $interpolate)
                    : $this->webhookPayload($item ?? $model, $originalValues);
                if (! $endpoint || $data === null) {
                    break;
                }
                $event = trim($interpolate((string)($options->firstWhere('key', 'event')->value ?? ''))) ?: Str::slug($this->name, '.');
                DB::afterCommit(fn () => $endpoint->queue($event, $data));
                break;
        }
    }
    private function interpolateJson(mixed $template, callable $interpolate): ?array {
        if (! is_array($template)) {
            return null;
        }
        array_walk_recursive($template, function (&$value) use ($interpolate) {
            if (is_string($value)) {
                $value = $interpolate($value);
            }
        });
        return $template;
    }
    private function webhookPayload(?Model $model, array $originalValues): array {
        $current = $model?->getAttributes() ?? [];
        $old     = array_filter($originalValues, fn ($value, $key) => (is_scalar($value) || $value === null) && (string)$value !== (string)(is_scalar($current[$key] ?? null) ? $current[$key] : ''), ARRAY_FILTER_USE_BOTH);
        return array_filter([
            'sentinel' => $this->name,
            'trigger'  => $this->trigger->name,
            'table'    => $this->table_name,
            'model'    => $model?->toArray(),
            'old'      => $this->trigger === SentinelTriggerType::OnUpdated ? $old : null,
        ], fn ($value) => $value !== null);
    }

    /**
     * Interpolate template variables in a string using {{variable.field}} syntax
     * Supports: {{triggerVar.field}}, {{triggerVar.relation.field}}, {{old.field}}
     */
    private function interpolate(string $template, ?Model $model, array $originalValues = []): string {
        if (! $model) {
            return $template;
        }

        $triggerVar = $this->trigger_variable ?? 'model';
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($model, $originalValues, $triggerVar) {
            $path = trim($matches[1]);

            if (str_starts_with($path, 'old.')) {
                $field = substr($path, 4);
                return (string)data_get($originalValues, $field, '');
            }

            if (str_starts_with($path, $triggerVar.'.')) {
                $field = substr($path, strlen($triggerVar) + 1);
                return (string)(data_get($model, $field) ?? '');
            }

            return '';
        }, $template);
    }

    /**
     * Interpolate with extended context for for_each loops
     * Supports: {{model.field}}, {{item.field}}, {{original.field}}
     */
    private function interpolateWithContext(string $template, array $context): string {
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($context) {
            $path  = trim($matches[1]);
            $parts = explode('.', $path, 2);

            if (count($parts) === 2) {
                $contextKey = $parts[0];
                $field      = $parts[1];

                if (isset($context[$contextKey])) {
                    $source = $context[$contextKey];
                    if ($source instanceof Model) {
                        return data_get($source, $field, '');
                    }
                    if (is_array($source)) {
                        return data_get($source, $field, '');
                    }
                }
            }
            return '';
        }, $template);
    }

    private function resolveRelation(Model $model, string $relation): ?iterable {
        if (str_contains($relation, '.')) {
            $parts   = explode('.', $relation);
            $current = $model;

            for ($i = 0; $i < count($parts) - 1; $i++) {
                $part    = $parts[$i];
                $current = data_get($current, $part);
                if (! $current instanceof Model) {
                    return null;
                }
            }

            $lastPart = $parts[count($parts) - 1];
            return $this->resolveRelation($current, $lastPart);
        }

        if (str_ends_with($relation, '()')) {
            $method = substr($relation, 0, -2);
            if (method_exists($model, $method)) {
                $result = $model->$method();
                if ($result instanceof Collection || is_array($result)) {
                    return $result;
                }
                if ($result instanceof Relation) {
                    return $result->get();
                }
            }
            return null;
        }

        if (method_exists($model, $relation)) {
            $result = $model->$relation;
            if ($result instanceof Collection || is_array($result)) {
                return $result;
            }
        }
        return null;
    }
    private function matchesNestedConditions(array $conditionGroups, Model $item, Model $model, array $originalValues, string $variable): bool {
        if (empty($conditionGroups)) {
            return true;
        }

        foreach ($conditionGroups as $group) {
            $groupMatches = true;
            foreach ($group as $condition) {
                if (! $this->matchesNestedCondition($condition, $item, $model, $originalValues, $variable)) {
                    $groupMatches = false;
                    break;
                }
            }
            if ($groupMatches) {
                return true;
            }
        }
        return false;
    }
    private function matchesNestedCondition(object $condition, Model $item, Model $model, array $originalValues, string $variable): bool {
        $key = $condition->key ?? 'none';
        if ($key === 'none') {
            return true;
        }

        $options = collect($condition->options ?? []);
        $column  = $options->firstWhere('key', 'column')->value ?? null;
        $input   = $options->firstWhere('key', 'input')->value ?? null;

        if (! $column) {
            return true;
        }

        // Resolve value: check if it's {{variable.field}} or {{field}}
        $value    = $this->resolveNestedValue($column, $item, $model, $variable);
        $inverted = $condition->inverted ?? false;

        $result = match ($key) {
            'null'        => $value === null || $value === '',
            'not_null'    => $value !== null && $value !== '',
            'true'        => (bool)$value === true,
            'false'       => (bool)$value === false,
            'equal'       => $value == $input,
            'not_equal'   => $value != $input,
            'greater'     => $value > $input,
            'less'        => $value < $input,
            'contains'    => str_contains((string)$value, (string)$input),
            'starts_with' => str_starts_with((string)$value, (string)$input),
            'ends_with'   => str_ends_with((string)$value, (string)$input),
            default       => true,
        };
        return $inverted ? ! $result : $result;
    }
    private function resolveNestedValue(string $path, Model $item, Model $model, string $variable): mixed {
        $triggerVar = $this->trigger_variable ?? 'model';

        if (str_starts_with($path, $variable.'.')) {
            return data_get($item, substr($path, strlen($variable) + 1));
        }
        if (str_starts_with($path, $triggerVar.'.')) {
            return data_get($model, substr($path, strlen($triggerVar) + 1));
        }

        return null;
    }
    private function interpolateNested(string $template, Model $model, Model $item, string $variable, array $originalValues): string {
        $triggerVar = $this->trigger_variable ?? 'model';
        return preg_replace_callback('/\{\{([^}]+)\}\}/', function ($matches) use ($model, $item, $variable, $originalValues, $triggerVar) {
            $path = trim($matches[1]);

            if (str_starts_with($path, 'old.')) {
                return (string)data_get($originalValues, substr($path, 4), '');
            }
            if (str_starts_with($path, $variable.'.')) {
                return (string)data_get($item, substr($path, strlen($variable) + 1), '');
            }
            if (str_starts_with($path, $triggerVar.'.')) {
                return (string)data_get($model, substr($path, strlen($triggerVar) + 1), '');
            }

            return '';
        }, $template);
    }
    private function isModelBased() {
        return in_array($this->trigger, [
            SentinelTriggerType::OnCreated,
            SentinelTriggerType::OnUpdated,
            SentinelTriggerType::OnDeleted,
        ]);
    }

    /**
     * Strip variable prefix from a path (e.g., "pps.project.name" -> "project.name")
     */
    private function stripVariablePrefix(?string $path, string $variable): ?string {
        if (! $path) {
            return $path;
        }
        if (str_starts_with($path, $variable.'.')) {
            return substr($path, strlen($variable) + 1);
        }
        return $path;
    }
}
