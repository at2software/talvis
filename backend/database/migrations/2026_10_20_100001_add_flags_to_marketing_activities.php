<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    private const TABLES = ['marketing_activities', 'marketing_initiative_activities'];

    public function up(): void {
        foreach (self::TABLES as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->unsignedInteger('flags')->default(0)->after('quick_action'));
        }
    }
    public function down(): void {
        foreach (self::TABLES as $name) {
            Schema::table($name, fn (Blueprint $table) => $table->dropColumn('flags'));
        }
    }
};
