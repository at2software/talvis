<?php

namespace App\Flow\Listeners;

use App\Flow\Chat\ApprovalChat;
use App\Flow\Events\ApprovalRequested;

class NotifyChatOfApprovalRequest {
    public function __construct(private readonly ApprovalChat $chat) {}

    public function handle(ApprovalRequested $event): void {
        $this->chat->notify($event->approval);
    }
}
