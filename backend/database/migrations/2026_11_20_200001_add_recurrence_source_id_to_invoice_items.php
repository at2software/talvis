<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Spawns created by cron:standing-orders reference the subscription item they were created from.
 * Existing spawns are intentionally not backfilled.
 */
return new class extends Migration {
    public function up(): void {
        Schema::table('invoice_items', function (Blueprint $table) {
            $table->unsignedInteger('recurrence_source_id')->nullable()->after('type');
            $table->foreign('recurrence_source_id')->references('id')->on('invoice_items')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::table('invoice_items', function (Blueprint $table) {
            $table->dropForeign(['recurrence_source_id']);
            $table->dropColumn('recurrence_source_id');
        });
    }
};
