<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('flow_jobs', function (Blueprint $table) {
            $table->enum('state', ['open', 'claimed', 'running', 'awaiting_gate', 'in_review', 'completed', 'failed', 'rejected'])->default('open')->change();
        });
        Schema::table('flow_approvals', function (Blueprint $table) {
            $table->enum('decision', ['pending', 'approved', 'rejected', 'changes_requested', 'withdrawn'])->default('pending')->change();
        });
        Schema::table('flow_approval_votes', function (Blueprint $table) {
            $table->enum('decision', ['approved', 'rejected', 'changes_requested'])->change();
        });
        Schema::table('flow_audit_log', function (Blueprint $table) {
            $table->enum('actor_type', ['user', 'machine', 'system'])->change();
        });

        Schema::table('flow_job_types', function (Blueprint $table) {
            $table->json('review_gate_keys')->nullable()->after('input_schema');
        });
        foreach (DB::table('flow_job_types')->whereNotNull('release_gate_key')->get(['id', 'release_gate_key']) as $type) {
            DB::table('flow_job_types')->where('id', $type->id)->update(['review_gate_keys' => json_encode([$type->release_gate_key])]);
        }
        Schema::table('flow_job_types', function (Blueprint $table) {
            $table->dropColumn('release_gate_key');
        });
    }
    public function down(): void {
        Schema::table('flow_job_types', function (Blueprint $table) {
            $table->string('release_gate_key')->nullable()->after('input_schema');
        });
        foreach (DB::table('flow_job_types')->whereNotNull('review_gate_keys')->get(['id', 'review_gate_keys']) as $type) {
            DB::table('flow_job_types')->where('id', $type->id)->update(['release_gate_key' => json_decode($type->review_gate_keys, true)[0] ?? null]);
        }
        Schema::table('flow_job_types', function (Blueprint $table) {
            $table->dropColumn('review_gate_keys');
        });

        DB::table('flow_audit_log')->where('actor_type', 'system')->update(['actor_type' => 'user']);
        Schema::table('flow_audit_log', function (Blueprint $table) {
            $table->enum('actor_type', ['user', 'machine'])->change();
        });
        DB::table('flow_approval_votes')->where('decision', 'changes_requested')->update(['decision' => 'rejected']);
        Schema::table('flow_approval_votes', function (Blueprint $table) {
            $table->enum('decision', ['approved', 'rejected'])->change();
        });
        DB::table('flow_approvals')->whereIn('decision', ['changes_requested', 'withdrawn'])->update(['decision' => 'rejected']);
        Schema::table('flow_approvals', function (Blueprint $table) {
            $table->enum('decision', ['pending', 'approved', 'rejected'])->default('pending')->change();
        });
        DB::table('flow_jobs')->where('state', 'in_review')->update(['state' => 'completed']);
        Schema::table('flow_jobs', function (Blueprint $table) {
            $table->enum('state', ['open', 'claimed', 'running', 'awaiting_gate', 'completed', 'failed', 'rejected'])->default('open')->change();
        });
    }
};
