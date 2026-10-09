<?php

namespace App\Support;

use App\Support\Calendar\CalendarEvent;
use DateTimeImmutable;
use DateTimeZone;

/**
 * @see https://learn.microsoft.com/en-us/graph/api/resources/event
 * @see https://learn.microsoft.com/en-us/graph/api/resources/patternedrecurrence
 */
final class GraphEvent {
    private const WEEKDAYS = ['MO' => 'monday', 'TU' => 'tuesday', 'WE' => 'wednesday', 'TH' => 'thursday', 'FR' => 'friday', 'SA' => 'saturday', 'SU' => 'sunday'];

    public static function fromEvent(CalendarEvent $event): array {
        return array_filter([
            'subject'      => $event->title !== '' ? $event->title : '—',
            'body'         => $event->description ? ['contentType' => 'text', 'content' => $event->description] : null,
            'location'     => $event->location ? ['displayName' => $event->location] : null,
            'isAllDay'     => $event->allDay,
            'showAs'       => 'free',
            'isReminderOn' => false,
            'start'        => self::moment($event->start, $event->allDay),
            'end'          => self::moment($event->end, $event->allDay),
            'recurrence'   => $event->recurrence ? self::recurrence($event->recurrence, $event->start) : null,
        ], fn ($value) => $value !== null);
    }

    /** @return array{dateTime: string, timeZone: string} */
    private static function moment(DateTimeImmutable $moment, bool $allDay): array {
        return $allDay
            ? ['dateTime' => $moment->format('Y-m-d').'T00:00:00', 'timeZone' => 'UTC']
            : ['dateTime' => $moment->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\TH:i:s'), 'timeZone' => 'UTC'];
    }

    private static function recurrence(array $rule, DateTimeImmutable $start): ?array {
        $frequency = $rule['FREQ'] ?? null;
        if (isset($rule['BYSETPOS']) || (isset($rule['BYDAY']) && $frequency !== 'WEEKLY')) {
            return null;
        }
        $interval = max(1, (int)($rule['INTERVAL'] ?? 1));
        $days     = array_values(array_filter(array_map(fn ($day) => self::WEEKDAYS[substr($day, -2)] ?? null, (array)($rule['BYDAY'] ?? []))));
        $pattern  = match ($frequency) {
            'DAILY'   => ['type' => 'daily', 'interval' => $interval],
            'WEEKLY'  => ['type' => 'weekly', 'interval' => $interval, 'daysOfWeek' => $days ?: [strtolower($start->format('l'))], 'firstDayOfWeek' => 'monday'],
            'MONTHLY' => ['type' => 'absoluteMonthly', 'interval' => $interval, 'dayOfMonth' => (int)($rule['BYMONTHDAY'] ?? $start->format('j'))],
            'YEARLY'  => ['type' => 'absoluteYearly', 'interval' => $interval, 'month' => (int)($rule['BYMONTH'] ?? $start->format('n')), 'dayOfMonth' => (int)($rule['BYMONTHDAY'] ?? $start->format('j'))],
            default   => null,
        };
        if (! $pattern) {
            return null;
        }

        $range = ['type' => 'noEnd', 'startDate' => $start->format('Y-m-d')];
        if (isset($rule['UNTIL'])) {
            $range = [...$range, 'type' => 'endDate', 'endDate' => (new DateTimeImmutable($rule['UNTIL']))->format('Y-m-d')];
        } elseif (isset($rule['COUNT'])) {
            $range = [...$range, 'type' => 'numbered', 'numberOfOccurrences' => (int)$rule['COUNT']];
        }
        return ['pattern' => $pattern, 'range' => $range];
    }
}
