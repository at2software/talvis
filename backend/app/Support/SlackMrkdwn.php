<?php

namespace App\Support;

/**
 * @see https://api.slack.com/reference/surfaces/formatting
 */
final class SlackMrkdwn {
    public static function from(string $markdown): string {
        $text = str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $markdown);

        $text = MarkdownImages::flatten($text, fn (string $url, string $label) => "<$url|$label>");
        $text = preg_replace('/\[([^\]]+)\]\(([^)\s]+)\)/', '<$2|$1>', $text);
        $text = preg_replace('/\*\*(.+?)\*\*/s', '*$1*', $text);
        $text = preg_replace('/~~(.+?)~~/s', '~$1~', $text);
        $text = preg_replace('/^#{1,6}[ \t]+(.+)$/m', '*$1*', $text);
        $text = preg_replace('/^([ \t]*)[*-][ \t]+\[ \][ \t]+/m', '$1☐ ', $text);
        $text = preg_replace('/^([ \t]*)[*-][ \t]+\[x\][ \t]+/mi', '$1☑ ', $text);
        return preg_replace('/^([ \t]*)\*[ \t]+/m', '$1• ', $text);
    }
}
