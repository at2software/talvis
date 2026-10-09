<?php

namespace App\Flow;

final class MachineAbility {
    public const JOBS_READ  = 'flow:jobs:read';
    public const JOBS_WRITE = 'flow:jobs:write';
    public const GATES_READ = 'flow:gates:read';
    public const ALL        = [self::JOBS_READ, self::JOBS_WRITE, self::GATES_READ];

    public static function isGrantable(string $ability): bool {
        return in_array($ability, self::ALL, true);
    }
    public static function onlyGrantable(array $abilities): bool {
        return $abilities !== [] && array_diff($abilities, self::ALL) === [];
    }
}
