<?php

namespace App\Services\FinTs\Native;

/**
 * Builds and escapes individual HBCI/FinTS 3.0 segments.
 *
 * Segment grammar:
 *   NAME:seqno:version[+DE[+DE...]]'
 * DEG (data element group) members are colon-separated within a +block.
 * Special chars in data values must be escaped with '?'.
 */
class HbciSegment {
    /**
     * @param string $name Segment name (e.g. "HKSAL")
     * @param int $seq Segment sequence number
     * @param int $version Segment version
     * @param array $elements Array of DE/DEG values. A nested array becomes a DEG (colon-separated).
     *                        Pass '' for an empty/omitted element.
     */
    public static function build(string $name, int $seq, int $version, array $elements = []): string {
        $head = "{$name}:{$seq}:{$version}";
        if (empty($elements)) {
            return $head."'";
        }
        $parts = array_map(fn ($e) => self::encodeElement($e), $elements);
        return $head.'+'.implode('+', $parts)."'";
    }

    private static function encodeElement(mixed $value): string {
        if (is_array($value)) {
            return implode(':', array_map(fn ($v) => self::escape((string)$v), $value));
        }
        return self::escape((string)$value);
    }
    public static function escape(string $value): string {
        return str_replace(['?', '+', ':', "'"], ['??', '?+', '?:', "?'"], $value);
    }

    /**
     * Wraps inner segment text in a binary data element (@len@ prefix).
     * Used for HNVSD content.
     */
    public static function binaryElement(string $data): string {
        return '@'.strlen($data).'@'.$data;
    }
}
