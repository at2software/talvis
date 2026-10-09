<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('project_project_state', function (Blueprint $table) {
            $table->unsignedInteger('user_id')->nullable()->after('project_state_id');
            $table->text('reason')->nullable()->after('user_id');
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::table('project_project_state', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn('reason');
        });
    }
};
