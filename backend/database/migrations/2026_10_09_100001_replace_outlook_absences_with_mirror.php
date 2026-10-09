<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('vacations', function (Blueprint $table) {
            $table->dropColumn('m365_event_id');
        });

        Schema::create('m365_mirror_items', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id');
            $table->string('kind', 16);
            $table->string('source_id', 100);
            $table->string('external_id', 255);
            $table->char('hash', 64);
            $table->timestamps();
            $table->unique(['user_id', 'kind', 'source_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });

        DB::table('params')->where('key', 'M365_SYNC')->update(['key' => 'M365_AUTOREPLY']);
    }
    public function down(): void {
        DB::table('params')->where('key', 'M365_AUTOREPLY')->update(['key' => 'M365_SYNC']);
        Schema::dropIfExists('m365_mirror_items');
        Schema::table('vacations', function (Blueprint $table) {
            $table->string('m365_event_id', 255)->nullable();
        });
    }
};
