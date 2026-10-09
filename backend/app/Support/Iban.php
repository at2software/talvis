<?php

namespace App\Support;

final class Iban {
    public static function normalize(string $iban): string {
        return strtoupper(preg_replace('/\s+/', '', $iban));
    }

    /**
     * @see https://en.wikipedia.org/wiki/International_Bank_Account_Number#Validating_the_IBAN
     */
    public static function isValid(string $iban): bool {
        $iban = self::normalize($iban);
        if (! preg_match('/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/', $iban)) {
            return false;
        }
        $digits = '';
        foreach (str_split(substr($iban, 4).substr($iban, 0, 4)) as $char) {
            $digits .= ctype_alpha($char) ? (string)(ord($char) - 55) : $char;
        }
        $remainder = 0;
        foreach (str_split($digits, 7) as $chunk) {
            $remainder = (int)($remainder.$chunk) % 97;
        }
        return $remainder === 1;
    }
}
