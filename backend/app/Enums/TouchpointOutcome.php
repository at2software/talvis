<?php

namespace App\Enums;

enum TouchpointOutcome: string {
    case MeetingBooked = 'meeting_booked';
    case Callback      = 'callback';
    case InfoRequested = 'info_requested';
    case Gatekeeper    = 'gatekeeper';
    case NotInterested = 'not_interested';

    public function prospectStatus(): ?string {
        return match ($this) {
            self::MeetingBooked => 'engaged',
            self::NotInterested => 'disqualified',
            default             => null,
        };
    }
}
