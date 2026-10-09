<?php

namespace App\Flow\Rules;

use App\Flow\Models\Transition;
use App\Models\Project;
use App\Models\User;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class AllowedProjectTransition implements ValidationRule {
    public function __construct(private readonly Project $project, private readonly ?User $user) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void {
        $fromStateId = $this->project->state?->id;
        if ($fromStateId === null || (int)$value === $fromStateId) {
            return;
        }
        $transition = Transition::between($fromStateId, (int)$value);
        if (! $transition) {
            $fail('The project cannot change from its current state to the selected state.');
            return;
        }
        if (! $this->user || ! $transition->allows($this->user)) {
            $fail("Changing to the selected state requires the role {$transition->required_role}.");
        }
    }
}
