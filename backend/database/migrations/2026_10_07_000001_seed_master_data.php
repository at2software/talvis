<?php

use App\Models\Param;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    private const PROJECT_STATES = [
        [1, 'prepared', '#7B0DCF', 0, 1, 0],
        [2, 'started', '#135BCD', 1, 1, 0],
        [3, 'finished', '#00C9A7', 2, 1, 1],
        [4, 'failed', '#F9001D', 2, 1, 0],
        [5, 'ignored', '#999999', 2, 0, 0],
        [6, 'quoted', '#7B0DCF', 0, 1, 0],
        [7, 'lead failed', '#F9001D', 2, 1, 0],
        [8, 'beta testing', '#135BCD', 1, 1, 0],
        [9, 'hyper care', '#135BCD', 1, 1, 0],
    ];
    private const LEAD_SOURCES       = ['Website', 'Referral', 'LinkedIn', 'Event', 'Other'];
    private const EXPENSE_CATEGORIES = ['Software', 'Hardware', 'Office', 'Travel', 'Insurance', 'Other'];

    public function up(): void {
        $now = now();

        foreach (self::PROJECT_STATES as [$id, $name, $color, $progress, $isInStats, $isSuccessful]) {
            DB::table('project_states')->insertOrIgnore([
                'id'            => $id,
                'name'          => $name,
                'color'         => $color,
                'progress'      => $progress,
                'is_in_stats'   => $isInStats,
                'is_successful' => $isSuccessful,
                'created_at'    => $now,
                'updated_at'    => $now,
            ]);
        }

        if (DB::table('lead_sources')->doesntExist()) {
            DB::table('lead_sources')->insert(array_map(fn ($name) => ['name' => $name, 'created_at' => $now, 'updated_at' => $now], self::LEAD_SOURCES));
        }

        if (DB::table('expense_categories')->doesntExist()) {
            DB::table('expense_categories')->insert(array_map(fn ($name) => ['name' => $name, 'color' => null, 'flags' => 0, 'created_at' => $now, 'updated_at' => $now], self::EXPENSE_CATEGORIES));
        }

        $legacyVatId = Param::get('ME_VATID', doNotCreate: true)?->value;
        $vatId       = Param::get('ME_VAT_ID');
        if (! empty($legacyVatId) && empty($vatId->value)) {
            $vatId->value = $legacyVatId;
            $vatId->save();
        }
    }
    public function down(): void {}
};
