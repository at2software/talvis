<?php

namespace App\Enums;

enum TouchpointChannel: string {
    case Call     = 'call';
    case Email    = 'email';
    case LinkedIn = 'linkedin';

    public static function fromQuickAction(?string $quickAction): ?self {
        return match ($quickAction) {
            'CALL'                        => self::Call,
            'EMAIL'                       => self::Email,
            'LINKEDIN', 'LINKEDIN_SEARCH' => self::LinkedIn,
            default                       => null,
        };
    }
    public function quickActions(): array {
        return match ($this) {
            self::Call     => ['CALL'],
            self::Email    => ['EMAIL'],
            self::LinkedIn => ['LINKEDIN', 'LINKEDIN_SEARCH'],
        };
    }
    public function results(): array {
        return match ($this) {
            self::Call     => [TouchpointResult::Connected, TouchpointResult::NoAnswer, TouchpointResult::Voicemail, TouchpointResult::Busy, TouchpointResult::WrongNumber],
            self::Email    => [TouchpointResult::Sent, TouchpointResult::Replied, TouchpointResult::Bounced],
            self::LinkedIn => [TouchpointResult::Sent, TouchpointResult::Replied],
        };
    }
}
