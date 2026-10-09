<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('vacations', function (Blueprint $table) {
            $table->dropForeign(['approved_by_id']);
            $table->foreign('approved_by_id')->references('id')->on('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::table('vacations', function (Blueprint $table) {
            $table->dropForeign(['approved_by_id']);
            $table->foreign('approved_by_id')->references('id')->on('users');
        });
    }
};
