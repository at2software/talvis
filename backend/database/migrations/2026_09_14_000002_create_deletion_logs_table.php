<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('deletion_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id')->nullable();
            $table->morphs('model');
            $table->nullableMorphs('context');
            $table->string('label')->nullable();
            $table->json('payload')->nullable();
            $table->json('meta')->nullable();
            $table->boolean('is_restorable')->default(false);
            $table->timestamp('restored_at')->nullable();
            $table->unsignedInteger('restored_by_id')->nullable();
            $table->timestamps();
            $table->index('created_at');
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('restored_by_id')->references('id')->on('users')->nullOnDelete();
        });
    }
    public function down(): void {
        Schema::dropIfExists('deletion_logs');
    }
};
