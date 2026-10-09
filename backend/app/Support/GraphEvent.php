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
    private const ORDINALS = ['1' => 'first', '2' => 'second', '3' => 'third', '4' => 'fourth', '-1' => 'last'];
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
        if ($allDay) {
            return ['dateTime' => $moment->format('Y-m-d').'T00:00:00', 'timeZone' => 'UTC'];
        }
        $zone = $moment->getTimezone()->getName();
        if (! in_array($zone, DateTimeZone::listIdentifiers(), true)) {
            [$moment, $zone] = [$moment->setTimezone(new DateTimeZone('UTC')), 'UTC'];
        }
        return ['dateTime' => $moment->format('Y-m-d\TH:i:s'), 'timeZone' => $zone];
    }

    private static function recurrence(array $rule, DateTimeImmutable $start): ?array {
        $frequency = $rule['FREQ'] ?? null;
        $interval  = max(1, (int)($rule['INTERVAL'] ?? 1));
        $byDay     = array_map(fn (string $day) => preg_match('/^([+-]?\d)?(MO|TU|WE|TH|FR|SA|SU)$/', $day, $match) ? ['ordinal' => $match[1] ?? '', 'day' => self::WEEKDAYS[$match[2]]] : null, (array)($rule['BYDAY'] ?? []));
        if (in_array(null, $byDay, true)) {
            return null;
        }
        $days     = array_column($byDay, 'day');
        $ordinals = array_unique([...array_filter(array_column($byDay, 'ordinal'), 'strlen'), ...(array)($rule['BYSETPOS'] ?? [])]);
        $index    = count($ordinals) === 1 ? (self::ORDINALS[(string)(int)reset($ordinals)] ?? null) : null;
        $relative = $days && in_array($frequency, ['MONTHLY', 'YEARLY'], true);
        if (($relative && ! $index) || (! $relative && $ordinals)) {
            return null;
        }
        $month   = (int)($rule['BYMONTH'] ?? $start->format('n'));
        $pattern = match (true) {
            $frequency === 'DAILY'   => ['type' => 'daily', 'interval' => $interval],
            $frequency === 'WEEKLY'  => ['type' => 'weekly', 'interval' => $interval, 'daysOfWeek' => $days ?: [strtolower($start->format('l'))], 'firstDayOfWeek' => 'monday'],
            $frequency === 'MONTHLY' => $relative
                ? ['type' => 'relativeMonthly', 'interval' => $interval, 'daysOfWeek' => $days, 'index' => $index]
                : ['type' => 'absoluteMonthly', 'interval' => $interval, 'dayOfMonth' => (int)($rule['BYMONTHDAY'] ?? $start->format('j'))],
            $frequency === 'YEARLY'  => $relative
                ? ['type' => 'relativeYearly', 'interval' => $interval, 'daysOfWeek' => $days, 'index' => $index, 'month' => $month]
                : ['type' => 'absoluteYearly', 'interval' => $interval, 'month' => $month, 'dayOfMonth' => (int)($rule['BYMONTHDAY'] ?? $start->format('j'))],
            default                  => null,
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
