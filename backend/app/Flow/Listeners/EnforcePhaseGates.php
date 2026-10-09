<?php

namespace App\Flow\Listeners;

use App\Events\ProjectStateTransitioning;
use App\Flow\Models\Phase;
use App\Flow\PhaseService;

class EnforcePhaseGates {
    public function __construct(private readonly PhaseService $phases) {}

    public function handle(ProjectStateTransitioning $event): void {
        $from = Phase::forState($event->from->id);
        $to   = Phase::forState($event->to->id);
        if (! $from || ! $to || $to->sort <= $from->sort) {
            return;
        }
        $missing = $this->phases->missingGates($event->project, $from);
        if ($missing->isNotEmpty()) {
            $gates = $missing->map(fn ($gate) => "\"{$gate['name']}\" ({$gate['key']})")->implode(', ');
            $event->reject("Phase \"{$from->name}\" cannot be left before these gates are approved: {$gates}.");
        }
    }
}
