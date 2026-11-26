<?php

namespace App\Enums;

enum InvoiceItemType: int {
    case Default    = 0;
    case Inactive   = 1;
    case Optional   = 2;
    case Paydown    = 10;
    case Discount   = 11;
    case Instalment = 12;
    case Header     = 20;
    case Daily      = 30;
    case Weekly     = 31;
    case Monthly    = 32;
    case Quarterly  = 33;
    case Yearly     = 34;

    public const array Repeating             = [self::Daily, self::Weekly, self::Monthly, self::Quarterly, self::Yearly];
    public const array Total                 = [self::Default, self::Discount, self::Paydown];
    public const array TotalRemaining        = [self::Default, self::Discount, self::Paydown, self::Instalment];
    public const array ProjectTotal          = [self::Default, self::Discount];
    public const array ProjectTotalRemaining = [self::Default, self::Discount, self::Paydown, self::Instalment];

    public function perYear(): int {
        return match ($this) {
            self::Daily     => 365,
            self::Weekly    => 52,
            self::Monthly   => 12,
            self::Quarterly => 4,
            self::Yearly    => 1,
            default         => 0,
        };
    }
    public static function asArray(): array {
        return array_column(self::cases(), 'value', 'name');
    }
}
