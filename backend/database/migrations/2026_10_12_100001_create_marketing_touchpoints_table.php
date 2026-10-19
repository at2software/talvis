<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('marketing_touchpoints', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('user_id')->nullable();
            $table->unsignedInteger('marketing_prospect_id')->nullable();
            $table->unsignedInteger('marketing_prospect_activity_id')->nullable();
            $table->unsignedInteger('company_id')->nullable();
            $table->string('channel', 16);
            $table->string('result', 32);
            $table->string('outcome', 32)->nullable();
            $table->text('notes')->nullable();
            $table->dateTime('occurred_at');
            $table->timestamps();
            $table->foreign('user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('marketing_prospect_id')->references('id')->on('marketing_prospects')->cascadeOnDelete();
            $table->foreign('marketing_prospect_activity_id')->references('id')->on('marketing_prospect_activities')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->index(['user_id', 'occurred_at']);
            $table->index(['company_id', 'occurred_at']);
            $table->index(['marketing_prospect_id', 'occurred_at']);
        });
    }
    public function down(): void {
        Schema::dropIfExists('marketing_touchpoints');
    }
};
