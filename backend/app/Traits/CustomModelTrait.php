<?php

namespace App\Traits;

use App\Builders\BaseBuilder;
use App\Models\Param;
use Exception;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use ReflectionClass;

trait CustomModelTrait {
    use HasParams;

    /**
     * @param mixed $key name of the polymorphic column ({key}_id and {key}_type)
     * @return array search array for polymorphic relations
     */
    public function toPoly($key = 'parent') {
        return ["{$key}_type" => $this::class, "{$key}_id" => $this->id];
    }

    public function getMutators() {
        return $this->my_mutators ?? [];
    }
    public function getTableColumns() {
        return $this->getConnection()->getSchemaBuilder()->getColumnListing($this->getTable());
    }
    public function getColumnDescriptions() {
        $wrapped = $this->getConnection()->getQueryGrammar()->wrapTable($this->getTable());
        return DB::select("DESCRIBE {$wrapped}");
    }

    private static array $virtualColumnCache = [];

    public function getVirtualColumns() {
        $table = $this->getTable();
        if (! array_key_exists($table, static::$virtualColumnCache)) {
            static::$virtualColumnCache[$table] = array_values(array_map(
                fn ($_) => $_->Field,
                Arr::where($this->getColumnDescriptions(), fn ($_) => $_->Extra === 'VIRTUAL GENERATED')
            ));
        }
        return static::$virtualColumnCache[$table];
    }

    /**
     * Basically the same as a morphMany relation, but yields HasMany instead of MorphMany.
     * This way you can use SomeClass::whereHas('relation'), which is not possible for MorphMany relations.
     */
    public function hasManyMorph($class, $key = 'parent') {
        return $this->hasMany($class, $key.'_id')->where($key.'_type', $this::class);
    }

    public function hasOneMorph($class, $key = 'parent') {
        return $this->hasOne($class, $key.'_id')->where($key.'_type', $this::class);
    }

    // ********** CRUD Role Access *********** //
    private static array $modelRoleAccess = [
        // === PROJECTS ===
        'Project'                => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'Assignment'             => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'AssignmentRole'         => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'UptimeMonitor'          => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'UptimeCheck'            => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'ProjectUptimeMonitor'   => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'DebriefPositive'        => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'DebriefProblem'         => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'DebriefProblemCategory' => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'DebriefProjectDebrief'  => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],
        'DebriefSolution'        => ['create' => ['project_manager'], 'read' => ['user', 'project_manager'], 'update' => ['project_manager'], 'delete' => []],

        // === COMPANIES / CRM ===
        'Company'           => ['create' => ['project_manager', 'marketing'], 'read' => ['user', 'project_manager', 'marketing'], 'update' => ['project_manager', 'marketing'], 'delete' => []],
        'CompanyContact'    => ['create' => ['project_manager', 'marketing'], 'read' => ['user', 'project_manager', 'marketing'], 'update' => ['project_manager', 'marketing'], 'delete' => []],
        'Contact'           => ['create' => ['project_manager', 'marketing'], 'read' => ['user', 'project_manager', 'marketing'], 'update' => ['project_manager', 'marketing'], 'delete' => []],
        'Connection'        => ['create' => ['project_manager', 'marketing'], 'read' => ['user', 'project_manager', 'marketing'], 'update' => ['project_manager', 'marketing'], 'delete' => []],
        'ConnectionProject' => ['create' => ['project_manager', 'marketing'], 'read' => ['user', 'project_manager', 'marketing'], 'update' => ['project_manager', 'marketing'], 'delete' => []],

        // === INVOICES ===
        'Invoice'               => ['create' => ['invoicing'], 'read' => ['invoicing'], 'update' => ['invoicing'], 'delete' => ['invoicing']],
        'InvoiceItem'           => ['create' => ['invoicing', 'project_manager'], 'read' => ['invoicing', 'project_manager'], 'update' => ['invoicing', 'project_manager'], 'delete' => ['invoicing', 'project_manager']],
        'InvoiceReminder'       => ['create' => ['invoicing'], 'read' => ['invoicing'], 'update' => ['invoicing'], 'delete' => ['invoicing']],
        'InvoiceItemPrediction' => ['create' => ['invoicing', 'project_manager'], 'read' => ['invoicing', 'project_manager'], 'update' => ['invoicing', 'project_manager'], 'delete' => ['invoicing', 'project_manager']],

        // === PRODUCTS ===
        'Product'      => ['create' => ['product_manager'], 'read' => ['user', 'project_manager', 'product_manager'], 'update' => ['product_manager'], 'delete' => ['product_manager']],
        'ProductGroup' => ['create' => ['product_manager'], 'read' => ['user', 'project_manager', 'product_manager'], 'update' => ['product_manager'], 'delete' => ['product_manager']],

        // === MARKETING ===
        'MarketingActivity'           => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingInitiative'         => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingInitiativeActivity' => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingPerformanceMetric'  => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingProspect'           => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingProspectActivity'   => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingTouchpoint'         => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],
        'MarketingWorkflow'           => ['create' => ['marketing'], 'read' => ['marketing'], 'update' => ['marketing'], 'delete' => ['marketing']],

        // === HR ===
        'UserEmployment' => ['create' => ['hr'], 'read' => ['hr'], 'update' => ['hr'], 'delete' => []],
        'UserGroup'      => ['create' => ['hr'], 'read' => ['hr', 'project_manager'], 'update' => ['hr'], 'delete' => []],
        'UserPaidTime'   => ['create' => ['hr'], 'read' => ['hr'], 'update' => ['hr'], 'delete' => []],
        'VacationGrant'  => ['create' => ['hr'], 'read' => ['hr', 'user'], 'update' => ['hr'], 'delete' => []],
        'Vacation'       => ['create' => ['hr', 'user'], 'read' => ['hr', 'user'], 'update' => ['hr'], 'delete' => []],

        // === FINANCIAL ===
        'Cash'            => ['create' => ['financial'], 'read' => ['financial'], 'update' => ['financial'], 'delete' => []],
        'CashRegister'    => ['create' => ['financial'], 'read' => ['financial'], 'update' => ['financial'], 'delete' => []],
        'Expense'         => ['create' => ['financial'], 'read' => ['financial'], 'update' => ['financial'], 'delete' => []],
        'ExpenseCategory' => ['create' => ['financial'], 'read' => ['financial'], 'update' => ['financial'], 'delete' => []],

        // === USERS ===
        'User' => ['create' => [], 'read' => ['user', 'project_manager'], 'update' => ['user', 'project_manager'], 'delete' => []],
    ];
    private static array $standardRoleAccess = [
        'create' => ['user', 'project_manager'],
        'read'   => ['user', 'project_manager'],
        'update' => ['user', 'project_manager'],
        'delete' => [],
    ];

    public function apply(Request $request, array $ignore = []) {
        $obj = $this->applyObject($request->all(), $ignore);
        foreach ($this->getMutators() as $_) {
            if ($request->exists($_)) {
                $obj->append($_);
            }
        }
        return $obj;
    }
    public function getValidFields($obj, array $ignore = []) {
        $virtualColumns = $this->getVirtualColumns();
        $fillable       = $this->getFillable();
        $validFields    = [];
        foreach ($obj as $key => $value) {
            if (is_array($value) || is_object($value)) {
                continue;
            }
            if (count($fillable) && ! in_array($key, $fillable) && ! in_array($key, $this->getMutators())) {
                continue;
            }
            if (! Schema::hasColumn($this->getTable(), $key) && ! in_array($key, $this->getMutators())) {
                continue;
            }
            if (in_array($key, $virtualColumns)) {
                continue;
            }
            if (isset($this->hidden) && in_array($key, $this->hidden)) {
                continue;
            }
            if (! in_array($key, $ignore)) {
                $validFields[$key] = $value;
            }
        }
        return $validFields;
    }
    public function applyObject($obj, array $ignore = []) {
        $data = $this->getValidFields($obj, $ignore);
        foreach ($data as $key => $value) {
            $this->$key = $value;
        }
        return $this;
    }
    public function applyAndSave(Request $request, array $ignore = []) {
        $this->apply($request, $ignore);
        $this->save();
        $this->touch();
        return $this;
    }
    public function appendRequest() {
        if (! ($a = request('append'))) {
            return $this;
        }
        $appends = explode(',', $a);
        $allowed = $this->allowedAppends ?? [];
        if (count($allowed)) {
            $appends = array_intersect($appends, $allowed);
        }
        if (! count($appends)) {
            return $this;
        }
        $this->append($appends);
    }
    public function getClassAttribute() {
        return (new ReflectionClass($this))->getShortName();
    }
    public function getIconAttribute() {
        return '../icons/dashboard.jpg';
    }
    public function getPathAttribute() {
        return $this->getTable().'/'.$this->id;
    }
    public function getFlag(int $flag, string $column = 'flags'): bool {
        return $this->$column & $flag;
    }
    public function unsetFlag(int $flag, string $column = 'flags'): void {
        $this->$column &= ~$flag;
    }
    public function setFlag(int $flag, string $column = 'flags'): void {
        $this->$column |= $flag;
    }
    public static function fromTablePath($path, $id) {
        if (! Schema::hasTable($path)) {
            return response('', 404);
        }
        $class = 'App\\Models\\'.Str::studly(Str::singular($path));
        if (! class_exists($class)) {
            return response('', 404);
        }
        try {
            return $class::findOrFail(intval($id));
        } catch (Exception $e) {
            return response('', 404);
        }
    }
    public static function polyOrNull($objectOrNull): array {
        return $objectOrNull?->toPoly() ?? self::nullPoly();
    }
    public static function nullPoly($key = 'parent'): array {
        return [$key.'_id' => null, $key.'_type' => null];
    }
    public function newEloquentBuilder($query) {
        return new BaseBuilder($query);
    }
    public function canBeAccessedByUser($crud = 'read'): bool {
        return self::checkRoleAccess($this::class, $crud);
    }
    public static function hasUserAccess($crud = 'read'): bool {
        return self::checkRoleAccess(static::class, $crud);
    }
    private static function checkRoleAccess(string $modelClass, string $crud): bool {
        $user = request()->user();
        if (! $user) {
            return false;
        }
        if ($user->hasRole('admin')) {
            return true;
        }
        $modelName    = str_replace('App\\Models\\', '', $modelClass);
        $accessMap    = self::$modelRoleAccess[$modelName] ?? self::$standardRoleAccess;
        $allowedRoles = $accessMap[$crud] ?? [];
        return $user->hasAnyRole($allowedRoles);
    }
    public function matches(array $attributes): bool {
        foreach ($attributes as $key => $value) {
            if (! property_exists($this, $key) || $value !== $this->$key) {
                return false;
            }
        }
        return true;
    }
}
