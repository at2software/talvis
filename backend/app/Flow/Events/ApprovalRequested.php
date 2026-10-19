<?php

namespace App\Flow\Events;

use App\Flow\Models\Approval;

class ApprovalRequested {
    public function __construct(public readonly Approval $approval) {}
}
