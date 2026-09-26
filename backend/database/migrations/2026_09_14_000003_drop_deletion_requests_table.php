<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::dropIfExists('deletion_requests');
    }
    public function down(): void {
        Schema::create('deletion_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id');
            $table->morphs('model');
            $table->text('reason')->nullable();
            $table->timestamps();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }
};
