<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('connections', function (Blueprint $table) {
            $table->string('type', 20)->nullable()->after('company2_id');
            $table->string('source', 20)->default('manual')->after('type');
            $table->string('source_url', 2048)->nullable()->after('source');
            $table->timestamp('verified_at')->nullable()->after('source_url');
        });
        Schema::table('companies', function (Blueprint $table) {
            $table->boolean('is_key_account')->default(false)->after('is_deprecated');
        });
    }
    public function down(): void {
        Schema::table('connections', function (Blueprint $table) {
            $table->dropColumn(['type', 'source', 'source_url', 'verified_at']);
        });
        Schema::table('companies', function (Blueprint $table) {
            $table->dropColumn('is_key_account');
        });
    }
};
