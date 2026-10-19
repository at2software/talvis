<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    private const TABLES = ['float_params', 'string_params', 'text_params'];
    private const INDEX  = 'idx_latest_param_lookup';

    public function up(): void {
        foreach (self::TABLES as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->index(['parent_type', 'parent_id', 'param_id'], self::INDEX));
        }
    }
    public function down(): void {
        foreach (self::TABLES as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropIndex(self::INDEX));
        }
    }
};
