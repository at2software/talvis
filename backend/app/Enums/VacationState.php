<?php

namespace App\Enums;

enum VacationState: int {
    case Open        = 0;
    case Approved    = 1;
    case NotApproved = 2;
    case Sick        = 3;
    case Cancelled   = 4;

    public const array Absences = [self::Approved, self::Sick];
}
