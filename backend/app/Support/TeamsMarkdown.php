<?php

namespace App\Support;

/**
 * @see https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/format-your-bot-messages
 */
final class TeamsMarkdown {
    public static function from(string $markdown): string {
        $text = MarkdownImages::flatten($markdown, fn (string $url, string $label) => "[$label]($url)");
        $text = preg_replace('/^#{1,6}[ \t]+(.+)$/m', '**$1**', $text);
        $text = preg_replace('/^([ \t]*)[*-][ \t]+\[ \][ \t]+/m', '$1- ☐ ', $text);
        $text = preg_replace('/^([ \t]*)[*-][ \t]+\[x\][ \t]+/mi', '$1- ☑ ', $text);
        return str_replace("\n", "\n\n", preg_replace("/\n{2,}/", "\n", $text));
    }
}
