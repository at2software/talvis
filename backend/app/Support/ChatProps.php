<?php

namespace App\Support;

/**
 * @phpstan-type ChatAttachment array{author_name?: string, text: string, color?: string}
 * @phpstan-type Props array{username?: string, icon_url?: string, type?: string, cache_id?: string, attachments?: list<ChatAttachment>}
 */
final class ChatProps {
    /** @return Props */
    public static function sender(string $name, ?string $iconUrl = null, ?string $type = null): array {
        return array_filter([
            'username' => $name,
            'icon_url' => $iconUrl,
            'type'     => $type,
        ]);
    }

    /** @return ChatAttachment */
    public static function attachment(string $text, ?string $author = null, ?string $color = null): array {
        return array_filter([
            'author_name' => $author,
            'text'        => $text,
            'color'       => $color,
        ]);
    }
}
