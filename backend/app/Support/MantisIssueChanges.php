<?php

namespace App\Support;

use Carbon\Carbon;
use Carbon\CarbonInterface;

final class MantisIssueChanges {
    private const DONE = ['resolved', 'closed'];

    /** @return array{status: ?string, handler: ?string} */
    public static function snapshot(array $issue): array {
        return [
            'status'  => $issue['status']['name'] ?? null,
            'handler' => $issue['handler']['name'] ?? null,
        ];
    }

    public static function isDone(?string $status): bool {
        return in_array($status, self::DONE, true);
    }

    /**
     * @param array{status: ?string, handler: ?string}|null $previous
     * @return list<array{action: string, by?: string, text?: string, status?: string, handler?: ?string}>
     */
    public static function between(array $issue, ?array $previous, CarbonInterface $since): array {
        $current = self::snapshot($issue);
        $changes = [];

        if (Carbon::parse($issue['created_at'])->gt($since)) {
            $changes[] = ['action' => 'open', 'by' => $issue['reporter']['name'] ?? null, 'text' => trim((string)($issue['description'] ?? ''))];
        } elseif ($previous) {
            if ($previous['status'] !== $current['status']) {
                $changes[] = match (true) {
                    self::isDone($current['status']) && ! self::isDone($previous['status'])  => ['action' => 'close', 'status' => $current['status']],
                    ! self::isDone($current['status']) && self::isDone($previous['status'])  => ['action' => 'reopen', 'status' => $current['status']],
                    default                                                                  => ['action' => 'status', 'status' => $current['status']],
                };
            }
            if ($previous['handler'] !== $current['handler']) {
                $changes[] = ['action' => 'assign', 'handler' => $current['handler']];
            }
        }

        foreach ($issue['notes'] ?? [] as $note) {
            if (Carbon::parse($note['created_at'])->gt($since)) {
                $changes[] = ['action' => 'note', 'by' => $note['reporter']['name'] ?? null, 'text' => trim((string)($note['text'] ?? ''))];
            }
        }
        return $changes;
    }
}
