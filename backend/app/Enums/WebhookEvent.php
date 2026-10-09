<?php

namespace App\Enums;

enum WebhookEvent: string {
    case InvoiceCreated      = 'invoice.created';
    case InvoicePaid         = 'invoice.paid';
    case InvoiceCancelled    = 'invoice.cancelled';
    case ProjectStateChanged = 'project.state_changed';
    case CompanyCreated      = 'company.created';
    case VacationApproved    = 'vacation.approved';
    case Ping                = 'ping';

    /** @return list<string> */
    public static function subscribable(): array {
        return array_values(array_map(fn (self $event) => $event->value, array_filter(self::cases(), fn (self $event) => $event !== self::Ping)));
    }
}
