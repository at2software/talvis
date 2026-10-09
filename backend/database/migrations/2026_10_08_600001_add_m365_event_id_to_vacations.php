<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('vacations', function (Blueprint $table) {
            $table->string('m365_event_id', 255)->nullable();
        });
    }
    public function down(): void {
        Schema::table('vacations', function (Blueprint $table) {
            $table->dropColumn('m365_event_id');
        });
    }
};
