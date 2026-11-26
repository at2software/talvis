<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('assignment_assignment_role', function (Blueprint $table) {
            $table->unsignedInteger('assignment_id');
            $table->unsignedInteger('assignment_role_id');
            $table->primary(['assignment_id', 'assignment_role_id']);
            $table->index('assignment_role_id');
            $table->foreign('assignment_id')->references('id')->on('assignments')->cascadeOnDelete();
            $table->foreign('assignment_role_id')->references('id')->on('assignment_roles')->cascadeOnDelete();
        });

        DB::statement('INSERT INTO assignment_assignment_role (assignment_id, assignment_role_id) SELECT id, role_id FROM assignments WHERE role_id IS NOT NULL AND role_id IN (SELECT id FROM assignment_roles)');

        Schema::table('assignments', function (Blueprint $table) {
            $table->dropForeign('assignments_role_id_foreign');
            $table->dropColumn('role_id');
        });
    }
    public function down(): void {
        Schema::table('assignments', function (Blueprint $table) {
            $table->unsignedInteger('role_id')->nullable()->after('assignee_type');
            $table->foreign('role_id')->references('id')->on('assignment_roles')->nullOnDelete();
        });

        DB::statement('UPDATE assignments SET role_id = (SELECT MIN(assignment_role_id) FROM assignment_assignment_role WHERE assignment_id = assignments.id)');

        Schema::dropIfExists('assignment_assignment_role');
    }
};
