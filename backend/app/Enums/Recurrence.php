<?php

namespace App\Enums;

use Carbon\CarbonInterface;
use Illuminate\Support\Carbon;

enum Recurrence: int {
    case None             = 0;
    case Daily            = 1;
    case Weekly           = 4;
    case EveryTwoWeeks    = 5;
    case Monthly          = 2;
    case EveryTwoMonths   = 6;
    case EveryThreeMonths = 7;
    case EverySixMonths   = 8;
    case Yearly           = 3;

    public static function add(self $interval, CarbonInterface $date): CarbonInterface {
        $date = $date->copy();
        return match ($interval) {
            self::None             => $date,
            self::Daily            => $date->addDay(),
            self::Weekly           => $date->addWeek(),
            self::EveryTwoWeeks    => $date->addWeeks(2),
            self::Monthly          => $date->addMonths(1),
            self::EveryTwoMonths   => $date->addMonths(2),
            self::EveryThreeMonths => $date->addMonths(3),
            self::EverySixMonths   => $date->addMonths(6),
            self::Yearly           => $date->addYear(),
        };
    }
    public static function sub(self $interval, ?Carbon $date = null): Carbon {
        $date ??= now();
        return match ($interval) {
            self::None             => $date,
            self::Daily            => $date->subDay(),
            self::Weekly           => $date->subWeek(),
            self::EveryTwoWeeks    => $date->subWeeks(2),
            self::Monthly          => $date->subMonths(1),
            self::EveryTwoMonths   => $date->subMonths(2),
            self::EveryThreeMonths => $date->subMonths(3),
            self::EverySixMonths   => $date->subMonths(6),
            self::Yearly           => $date->subYear(1),
        };
    }
}
