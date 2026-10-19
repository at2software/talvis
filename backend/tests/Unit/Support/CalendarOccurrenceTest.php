<?php

namespace Tests\Unit\Support;

use App\Support\Calendar\CalendarEvent;
use App\Support\Calendar\CalendarOccurrence;
use DateTimeImmutable;
use Sabre\VObject\Reader;
use Tests\TestCase;

class CalendarOccurrenceTest extends TestCase {
    private function occurrence(string $start, string $end, bool $busy = true, bool $allDay = false): CalendarOccurrence {
        $event = new CalendarEvent('id', 'uid', 'title', new DateTimeImmutable($start), new DateTimeImmutable($end), $allDay);
        return new CalendarOccurrence('test', $event, $busy);
    }
    public function test_busy_hours_merge_overlapping_meetings_and_skip_all_day_and_info_only_events(): void {
        $occurrences = [
            $this->occurrence('2026-10-13 10:00', '2026-10-13 11:00'),
            $this->occurrence('2026-10-13 10:30', '2026-10-13 12:00'),
            $this->occurrence('2026-10-13 14:00', '2026-10-13 15:00', busy: false),
            $this->occurrence('2026-10-13', '2026-10-14', allDay: true),
        ];
        $this->assertSame(2.0, CalendarOccurrence::busyHoursOn($occurrences, '2026-10-13'));
    }
    public function test_busy_hours_only_count_within_working_hours(): void {
        $this->assertSame(1.0, CalendarOccurrence::busyHoursOn([$this->occurrence('2026-10-13 07:00', '2026-10-13 09:00')], '2026-10-13'));
        $this->assertSame(0.5, CalendarOccurrence::busyHoursOn([$this->occurrence('2026-10-13 17:30', '2026-10-13 20:00')], '2026-10-13'));
        $this->assertSame(0.0, CalendarOccurrence::busyHoursOn([$this->occurrence('2026-10-13 22:00', '2026-10-14 02:00')], '2026-10-13'));
    }
    public function test_all_day_events_cover_every_day_until_their_exclusive_end(): void {
        $this->assertSame(['2026-10-12', '2026-10-13', '2026-10-14'], $this->occurrence('2026-10-12', '2026-10-15', allDay: true)->days());
    }
    public function test_recurring_events_expand_with_moved_occurrences(): void {
        $calendar = Reader::read(implode("\r\n", [
            'BEGIN:VCALENDAR', 'VERSION:2.0',
            'BEGIN:VEVENT', 'UID:weekly', 'SUMMARY:Weekly', 'DTSTART;TZID=Europe/Berlin:20261005T100000', 'DTEND;TZID=Europe/Berlin:20261005T110000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'END:VEVENT',
            'BEGIN:VEVENT', 'UID:weekly', 'RECURRENCE-ID;TZID=Europe/Berlin:20261012T100000', 'SUMMARY:Moved', 'DTSTART;TZID=Europe/Berlin:20261013T140000', 'DTEND;TZID=Europe/Berlin:20261013T150000', 'END:VEVENT',
            'END:VCALENDAR', '',
        ]));
        $occurrences = CalendarEvent::occurrences($calendar, new DateTimeImmutable('2026-10-01'), new DateTimeImmutable('2026-11-01'));
        $starts      = array_map(fn (CalendarEvent $event) => (new CalendarOccurrence('test', $event, false))->toArray()['start'], $occurrences);

        $this->assertSame(['2026-10-05T10:00:00+02:00', '2026-10-13T14:00:00+02:00', '2026-10-19T10:00:00+02:00'], $starts);
    }
}
