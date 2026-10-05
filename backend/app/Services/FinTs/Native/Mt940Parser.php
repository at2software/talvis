<?php

namespace App\Services\FinTs\Native;

use App\Services\FinTs\FinTsTransaction;

/**
 * Parses SWIFT MT940 account statement format into FinTsTransaction objects.
 *
 * Relevant MT940 fields:
 *   :61: <valuedate>[<bookdate>]<C|D|RC|RD>[<currency>]<amount>NONREF[//<bankref>]
 *   :86: <gvc>?00<short>?20..?29<purpose>?32<name>?33<name2>...
 */
class Mt940Parser {
    /**
     * @return FinTsTransaction[]
     */
    public static function parse(string $mt940): array {
        $transactions = [];

        $mt940 = str_replace(["\r\n", "\r"], "\n", $mt940);

        $fields = self::splitFields($mt940);

        $i = 0;
        while ($i < count($fields)) {
            ['tag' => $tag, 'value' => $value] = $fields[$i];

            if ($tag === '61') {
                $purpose = '';
                $rawName = '';

                // Peek at the :86: field that follows
                if (isset($fields[$i + 1]) && $fields[$i + 1]['tag'] === '86') {
                    ['purpose' => $purpose, 'name' => $rawName] = self::parse86($fields[$i + 1]['value']);
                    $i++; // consume :86:
                }

                $tx = self::parse61($value, $rawName, $purpose);
                if ($tx !== null) {
                    $transactions[] = $tx;
                }
            }

            $i++;
        }

        return $transactions;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // :61: transaction line
    // ──────────────────────────────────────────────────────────────────────────

    private static function parse61(string $value, string $name, string $description): ?FinTsTransaction {
        // Format: VVVV[BBBB]<D>[[currency]<amount>]<SWIFT code><ref>[//<bankref>[\n<info>]]
        // VVVV = value date YYMMDD (6) or MMDD (4)
        // BBBB = book date MMDD (4, optional)
        // D    = C / D / RC / RD
        // amount uses comma decimal separator

        $value = trim($value);

        $pos = 0;
        if (! preg_match('/^\d{6}/', $value, $m)) {
            return null;
        }
        $valueDateStr = $m[0];
        $pos          = 6;

        $bookDateStr = null;
        if (isset($value[$pos]) && ctype_digit($value[$pos])) {
            $bookDateStr = substr($value, $pos, 4);
            $pos += 4;
        }

        $storno      = false;
        $creditDebit = FinTsTransaction::CD_CREDIT;
        if (substr($value, $pos, 2) === 'RC') {
            $creditDebit = FinTsTransaction::CD_CREDIT;
            $storno      = true;
            $pos += 2;
        } elseif (substr($value, $pos, 2) === 'RD') {
            $creditDebit = FinTsTransaction::CD_DEBIT;
            $storno      = true;
            $pos += 2;
        } elseif ($value[$pos] === 'C') {
            $creditDebit = FinTsTransaction::CD_CREDIT;
            $pos++;
        } elseif ($value[$pos] === 'D') {
            $creditDebit = FinTsTransaction::CD_DEBIT;
            $pos++;
        } else {
            return null;
        }

        if (isset($value[$pos]) && ctype_alpha($value[$pos])) {
            $pos += 3;
        }

        // Amount: digits and comma up to the SWIFT transaction type code
        if (! preg_match('/^([\d,]+)/', substr($value, $pos), $amtMatch)) {
            return null;
        }
        $amount = (float)str_replace(',', '.', $amtMatch[1]);
        $pos += strlen($amtMatch[1]);

        $bookingDate = self::parseDate($bookDateStr ?? $valueDateStr, $bookDateStr === null);
        if ($bookingDate === null) {
            $bookingDate = self::parseDate($valueDateStr, true);
        }

        return new FinTsTransaction($creditDebit, $amount, $name, $description, $bookingDate, $storno);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // :86: purpose / name
    // ──────────────────────────────────────────────────────────────────────────

    private static function parse86(string $value): array {
        // MT940 lines wrap at 65 chars; strip line breaks so continuation lines
        // don't embed newlines (and sometimes leading spaces) inside sub-field values.
        $value = str_replace(["\r\n", "\r", "\n"], '', $value);

        // Sub-field format: ?NN<text>
        $subfields = [];
        $pattern   = '/\?(\d{2})([^?]*)/';
        preg_match_all($pattern, $value, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $subfields[(int)$m[1]] = $m[2];
        }

        // Purpose: concatenate ?20 through ?29
        $purpose = '';
        for ($n = 20; $n <= 29; $n++) {
            $purpose .= $subfields[$n] ?? '';
        }
        $purpose = trim($purpose);

        $sepa = self::parseSepaSubfields($purpose);
        if (isset($sepa['SVWZ'])) {
            $purpose = trim($sepa['SVWZ']);
        }

        // Counterparty name: ?32 + optional ?33
        $name = trim(($subfields[32] ?? '').($subfields[33] ?? ''));

        return ['purpose' => $purpose, 'name' => $name];
    }

    /**
     * @return array<string, string>
     */
    private static function parseSepaSubfields(string $purpose): array {
        $fields = [];
        if (! preg_match_all('/[A-Z]{4}\+/', $purpose, $m, PREG_OFFSET_CAPTURE)) {
            return $fields;
        }
        $tags = $m[0];
        foreach ($tags as $i => [$tag, $pos]) {
            $key          = substr($tag, 0, 4);
            $valueStart   = $pos + 5; // length of "XXXX+"
            $valueEnd     = isset($tags[$i + 1]) ? $tags[$i + 1][1] : strlen($purpose);
            $fields[$key] = substr($purpose, $valueStart, $valueEnd - $valueStart);
        }
        return $fields;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────────

    /** @return array<int, array{tag: string, value: string}> */
    private static function splitFields(string $mt940): array {
        $fields  = [];
        $pattern = '/^:(\w{1,5}):(.*?)(?=^:\w{1,5}:|\z)/ms';
        preg_match_all($pattern, $mt940, $matches, PREG_SET_ORDER);
        foreach ($matches as $m) {
            $fields[] = ['tag' => $m[1], 'value' => trim($m[2])];
        }
        return $fields;
    }

    private static function parseDate(string $dateStr, bool $isYymmdd): ?\DateTime {
        try {
            if ($isYymmdd && strlen($dateStr) === 6) {
                $year = (int)('20'.substr($dateStr, 0, 2));
                $mon  = (int)substr($dateStr, 2, 2);
                $day  = (int)substr($dateStr, 4, 2);
                return new \DateTime(sprintf('%04d-%02d-%02d', $year, $mon, $day));
            }
            if (! $isYymmdd && strlen($dateStr) === 4) {
                $mon  = (int)substr($dateStr, 0, 2);
                $day  = (int)substr($dateStr, 2, 2);
                $year = (int)date('Y');
                return new \DateTime(sprintf('%04d-%02d-%02d', $year, $mon, $day));
            }
        } catch (\Throwable) {
        }
        return null;
    }
}
