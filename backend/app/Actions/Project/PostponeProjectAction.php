<?php

namespace App\Actions\Project;

use App\Models\Comment;
use App\Models\Project;

class PostponeProjectAction {
    public function execute(Project $project, int $duration, ?string $comment = null): Project {
        $map = [
            1 => ['period' => 'weeks', 'amount' => 1, 'label' => '1 Wochen'],
            2 => ['period' => 'weeks', 'amount' => 2, 'label' => '2 Wochen'],
            3 => ['period' => 'months', 'amount' => 1, 'label' => '1 Monate'],
            4 => ['period' => 'months', 'amount' => 2, 'label' => '2 Monate'],
            5 => ['period' => 'months', 'amount' => 3, 'label' => '3 Monate'],
            6 => ['period' => 'months', 'amount' => 6, 'label' => '6 Monate'],
            7 => ['period' => 'months', 'amount' => 12, 'label' => '1 Jahr'],
        ];

        $config = $map[$duration] ?? null;
        if (! $config) {
            return $project;
        }

        $method             = 'add'.ucfirst($config['period']);
        $project->remind_at = now()->$method($config['amount'])->toDateTimeString();
        $project->save();

        $text = ($comment ? strip_tags($comment).'<br>' : '').'Frist verlängert ('.$config['label'].')';
        Comment::create([
            ...$project->toPoly(),
            'text'    => $text,
            'user_id' => request()->user()->id,
            'is_mini' => true,
        ]);

        return $project;
    }
}
