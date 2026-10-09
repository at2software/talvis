<?php

namespace App\Support;

final class MarkdownImages {
    private const IMAGE = '!\[([^\]]*)\]\(([^)\s]+)(?:\s+=[^)"\s]*)?(?:\s+"([^"]*)")?\)';

    /** @param callable(string $url, string $label): string $standalone */
    public static function flatten(string $markdown, callable $standalone): string {
        $text = preg_replace_callback('/^[ \t]*'.self::IMAGE.'[ \t]*$/m', fn ($m) => $standalone($m[2], self::label($m)), $markdown);
        return preg_replace_callback('/'.self::IMAGE.'/', fn ($m) => self::label($m), $text);
    }

    private static function label(array $match): string {
        return ($match[3] ?? '') !== '' ? $match[3] : $match[1];
    }
}
