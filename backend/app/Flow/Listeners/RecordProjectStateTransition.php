<?php

namespace App\Flow\Listeners;

use App\Events\ProjectStateTransitioned;
use App\Flow\Models\AuditEntry;

class RecordProjectStateTransition {
    public function handle(ProjectStateTransitioned $event): void {
        AuditEntry::record($event->project, 'project.state_changed', $event->actor, [
            'from_state_id' => $event->from->id,
            'to_state_id'   => $event->to->id,
            'reason'        => $event->reason,
        ]);
    }
}
