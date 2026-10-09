<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    private const STATE_CHANGE_WORKFLOW = [
        1 => [2, 5, 6, 7],
        2 => [1, 3, 4, 5, 8, 9],
        3 => [1],
        4 => [1],
        5 => [1],
        6 => [1, 2, 5, 7],
        7 => [1],
        8 => [1, 3, 4, 5, 9],
        9 => [1, 3, 4, 5],
    ];

    public function up(): void {
        Schema::create('flow_transitions', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('from_state_id');
            $table->unsignedInteger('to_state_id');
            $table->string('required_role')->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
            $table->unique(['from_state_id', 'to_state_id']);
            $table->foreign('from_state_id')->references('id')->on('project_states')->cascadeOnDelete();
            $table->foreign('to_state_id')->references('id')->on('project_states')->cascadeOnDelete();
        });

        $now      = now();
        $existing = DB::table('project_states')->pluck('id')->all();
        foreach (self::STATE_CHANGE_WORKFLOW as $from => $targets) {
            foreach ($targets as $to) {
                if (in_array($from, $existing) && in_array($to, $existing)) {
                    DB::table('flow_transitions')->insertOrIgnore([
                        'from_state_id' => $from,
                        'to_state_id'   => $to,
                        'created_at'    => $now,
                        'updated_at'    => $now,
                    ]);
                }
            }
        }
    }
    public function down(): void {
        Schema::dropIfExists('flow_transitions');
    }
};
