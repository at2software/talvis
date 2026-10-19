<?php

namespace App\Enums;

enum TouchpointResult: string {
    case Connected   = 'connected';
    case NoAnswer    = 'no_answer';
    case Voicemail   = 'voicemail';
    case Busy        = 'busy';
    case WrongNumber = 'wrong_number';
    case Sent        = 'sent';
    case Replied     = 'replied';
    case Bounced     = 'bounced';

    public function isReached(): bool {
        return in_array($this, [self::Connected, self::Replied]);
    }
    public function isInvalidContact(): bool {
        return in_array($this, [self::WrongNumber, self::Bounced]);
    }
    public function isAttempt(): bool {
        return in_array($this, [self::NoAnswer, self::Voicemail, self::Busy]);
    }
}
