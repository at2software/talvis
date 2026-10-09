<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('flow_risk_classes', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->unsignedInteger('level');
            $table->unsignedTinyInteger('release_required_approvals')->default(1);
            $table->timestamps();
        });

        Schema::table('projects', function (Blueprint $table) {
            $table->foreignId('flow_risk_class_id')->nullable()->constrained('flow_risk_classes')->nullOnDelete();
        });

        Schema::create('flow_phases', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->unsignedInteger('project_state_id')->unique();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->foreign('project_state_id')->references('id')->on('project_states')->cascadeOnDelete();
        });

        Schema::create('flow_gates', function (Blueprint $table) {
            $table->id();
            $table->string('key');
            $table->string('name');
            $table->foreignId('phase_id')->constrained('flow_phases')->cascadeOnDelete();
            $table->string('required_role');
            $table->unsignedTinyInteger('required_approvals')->nullable();
            $table->json('condition')->nullable();
            $table->unsignedInteger('sort')->default(0);
            $table->timestamps();
            $table->unique(['phase_id', 'key']);
        });

        Schema::create('flow_job_types', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->json('input_schema');
            $table->string('release_gate_key')->nullable();
            $table->timestamps();
        });

        Schema::create('flow_jobs', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('project_id');
            $table->string('type');
            $table->enum('state', ['open', 'claimed', 'running', 'awaiting_gate', 'completed', 'failed', 'rejected'])->default('open');
            $table->json('input');
            $table->json('output')->nullable();
            $table->string('claimed_by')->nullable();
            $table->timestamp('claimed_at')->nullable();
            $table->json('metrics')->nullable();
            $table->json('knowledge')->nullable();
            $table->unsignedInteger('created_by_id')->nullable();
            $table->timestamps();
            $table->index(['state', 'type']);
            $table->foreign('project_id')->references('id')->on('projects')->cascadeOnDelete();
            $table->foreign('created_by_id')->references('id')->on('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::dropIfExists('flow_jobs');
        Schema::dropIfExists('flow_job_types');
        Schema::dropIfExists('flow_gates');
        Schema::dropIfExists('flow_phases');
        Schema::table('projects', function (Blueprint $table) {
            $table->dropConstrainedForeignId('flow_risk_class_id');
        });
        Schema::dropIfExists('flow_risk_classes');
    }
};
