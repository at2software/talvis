<?php

namespace App\Flow;

use InvalidArgumentException;

final class GateCondition {
    public const ALWAYS         = 'always';
    public const RISK_LEVEL_GTE = 'risk_level_gte';

    public static function validate(?array $condition): void {
        if ($condition === null) {
            return;
        }
        if ($condition === [] || array_is_list($condition)) {
            throw new InvalidArgumentException('A gate condition must be an object such as {"always": true} or {"risk_level_gte": 3}.');
        }
        foreach ($condition as $key => $value) {
            match ($key) {
                self::ALWAYS         => $value === true ?: throw new InvalidArgumentException('Gate condition "always" only accepts true.'),
                self::RISK_LEVEL_GTE => is_int($value) && $value >= 0 ?: throw new InvalidArgumentException('Gate condition "risk_level_gte" needs a non-negative integer.'),
                default              => throw new InvalidArgumentException("Unknown gate condition \"{$key}\"."),
            };
        }
    }
    public static function applies(?array $condition, int $riskLevel): bool {
        foreach ($condition ?? [] as $key => $value) {
            if ($key === self::RISK_LEVEL_GTE && $riskLevel < $value) {
                return false;
            }
        }
        return true;
    }
}
