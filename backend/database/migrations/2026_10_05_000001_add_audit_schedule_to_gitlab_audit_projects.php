<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('gitlab_audit_projects', function (Blueprint $table) {
            $table->string('environment')->default('production');
            $table->string('cron')->nullable();
            $table->json('jobs')->nullable();
            $table->timestamp('last_run_at')->nullable();
            $table->unsignedBigInteger('last_pipeline_id')->nullable();
            $table->string('last_status')->nullable();
        });
    }
    public function down(): void {
        Schema::table('gitlab_audit_projects', function (Blueprint $table) {
            $table->dropColumn(['environment', 'cron', 'jobs', 'last_run_at', 'last_pipeline_id', 'last_status']);
        });
    }
};
