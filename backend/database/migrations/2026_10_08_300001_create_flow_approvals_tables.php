<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('flow_approvals', function (Blueprint $table) {
            $table->id();
            $table->string('subject_type');
            $table->unsignedBigInteger('subject_id');
            $table->string('gate_key')->nullable();
            $table->unsignedInteger('requested_by_id')->nullable();
            $table->string('required_role');
            $table->unsignedTinyInteger('required_approvals')->default(1);
            $table->enum('decision', ['pending', 'approved', 'rejected'])->default('pending');
            $table->unsignedInteger('decided_by_id')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->text('reason')->nullable();
            $table->json('context')->nullable();
            $table->string('selected_option')->nullable();
            $table->timestamps();
            $table->index(['subject_type', 'subject_id']);
            $table->index(['decision', 'required_role']);
            $table->foreign('requested_by_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('decided_by_id')->references('id')->on('users')->nullOnDelete();
        });

        Schema::create('flow_approval_votes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_id')->constrained('flow_approvals')->cascadeOnDelete();
            $table->unsignedInteger('user_id')->nullable();
            $table->enum('decision', ['approved', 'rejected']);
            $table->text('reason')->nullable();
            $table->string('selected_option')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['approval_id', 'user_id']);
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::dropIfExists('flow_approval_votes');
        Schema::dropIfExists('flow_approvals');
    }
};
