<?php

use App\Models\StringParam;
use App\Models\TextParam;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    private const LEGACY_EMPTY_DEFAULT = '[{"title":"Dashboard","cols":[[],[],[],[]]}]';

    public function up(): void {
        $param = DB::table('params')->where('key', 'DASHBOARDS')->first();
        if (! $param) {
            return;
        }

        $latestPerParent = DB::table('string_params')
            ->where('param_id', $param->id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->unique(fn ($row) => $row->parent_type.':'.$row->parent_id);

        foreach ($latestPerParent as $row) {
            $parent = ['param_id' => $param->id, 'parent_type' => $row->parent_type, 'parent_id' => $row->parent_id];
            if (DB::table('text_params')->where($parent)->exists()) {
                continue;
            }

            $value = $row->value;
            if ($value === self::LEGACY_EMPTY_DEFAULT || ! User::isValidDashboards($value)) {
                $value = $row->parent_type === User::class ? User::find($row->parent_id)?->defaultDashboards() : null;
            }
            if ($value === null) {
                continue;
            }

            DB::table('text_params')->insert([...$parent, 'value' => $value, 'created_at' => $row->created_at, 'updated_at' => $row->updated_at]);
        }

        DB::table('string_params')->where('param_id', $param->id)->delete();
        DB::table('params')->where('id', $param->id)->update(['type' => TextParam::class, 'has_history' => false]);
    }
    public function down(): void {
        DB::table('params')->where('key', 'DASHBOARDS')->update(['type' => StringParam::class, 'has_history' => true]);
    }
};
