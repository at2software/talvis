<?php

namespace Tests\Unit\Support;

use App\Support\Calendar\CalendarEvent;
use App\Support\GraphContact;
use App\Support\GraphEvent;
use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

class CalendarAdaptersTest extends TestCase {
    private function birthday(): CalendarEvent {
        $day = new DateTimeImmutable('1982-02-10');
        return new CalendarEvent('user_3', 'birthday-user-3@nexus', 'Birthday of Jane', $day, $day->modify('+1 day'), true, recurrence: ['FREQ' => 'YEARLY']);
    }
    public function test_all_day_events_render_as_date_values_for_webdav(): void {
        $ical = $this->birthday()->toICal();

        $this->assertStringContainsString("DTSTART;VALUE=DATE:19820210\r\n", $ical);
        $this->assertStringContainsString("DTEND;VALUE=DATE:19820211\r\n", $ical);
        $this->assertStringContainsString("RRULE:FREQ=YEARLY\r\n", $ical);
        $this->assertStringContainsString("UID:birthday-user-3@nexus\r\n", $ical);
    }
    public function test_ical_entries_survive_the_round_trip(): void {
        $ical  = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc\r\nDTSTART;TZID=Europe/Berlin:20261012T090000\r\nDTEND;TZID=Europe/Berlin:20261012T100000\r\nSUMMARY:Jour fixe\r\nLOCATION:Büro\r\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        $event = CalendarEvent::fromICal('calendarEntry_7', $ical);

        $this->assertSame('abc', $event->uid);
        $this->assertFalse($event->allDay);
        $this->assertSame('2026-10-12T07:00:00+00:00', $event->start->setTimezone(new \DateTimeZone('UTC'))->format('c'));
        $this->assertStringContainsString("DTSTART:20261012T070000Z\r\n", $event->toICal());
        $this->assertSame(['FREQ' => 'WEEKLY', 'BYDAY' => 'MO', 'COUNT' => '10'], $event->recurrence);
    }
    public function test_date_only_values_without_value_date_are_all_day(): void {
        $event = CalendarEvent::fromICal('calendarEntry_9', "BEGIN:VCALENDAR\r\nUID:6a2828c9b92fe\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Powtech\r\nDTSTART:20260929\r\nDTEND:20261002\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
        $graph = GraphEvent::fromEvent($event);

        $this->assertTrue($event->allDay);
        $this->assertSame(['dateTime' => '2026-09-29T00:00:00', 'timeZone' => 'UTC'], $graph['start']);
        $this->assertSame(['dateTime' => '2026-10-02T00:00:00', 'timeZone' => 'UTC'], $graph['end']);
        $this->assertStringContainsString("DTSTART;VALUE=DATE:20260929\r\n", $event->toICal());
    }
    public function test_exchange_events_are_free_and_keep_recurrence(): void {
        $graph = GraphEvent::fromEvent($this->birthday());

        $this->assertSame('free', $graph['showAs']);
        $this->assertTrue($graph['isAllDay']);
        $this->assertSame(['dateTime' => '1982-02-10T00:00:00', 'timeZone' => 'UTC'], $graph['start']);
        $this->assertSame(['type' => 'absoluteYearly', 'interval' => 1, 'month' => 2, 'dayOfMonth' => 10], $graph['recurrence']['pattern']);
        $this->assertSame('noEnd', $graph['recurrence']['range']['type']);
    }
    public function test_weekly_rules_map_to_days_of_week(): void {
        $ical  = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:abc\r\nDTSTART:20261012T070000Z\r\nDTEND:20261012T080000Z\r\nSUMMARY:x\r\nRRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        $graph = GraphEvent::fromEvent(CalendarEvent::fromICal('calendarEntry_1', $ical));

        $this->assertSame(['monday', 'wednesday'], $graph['recurrence']['pattern']['daysOfWeek']);
        $this->assertSame(['type' => 'numbered', 'startDate' => '2026-10-12', 'numberOfOccurrences' => 10], $graph['recurrence']['range']);
    }
    public function test_relative_monthly_rules_keep_their_local_time(): void {
        $ical  = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:689097c65cd11\r\nSUMMARY:Team Meeting\r\nRRULE:FREQ=MONTHLY;BYDAY=1WE\r\nDTSTART;TZID=Europe/Berlin:20250806T140000\r\nDTEND;TZID=Europe/Berlin:20250806T150000\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
        $graph = GraphEvent::fromEvent(CalendarEvent::fromICal('calendarEntry_24', $ical));

        $this->assertSame(['type' => 'relativeMonthly', 'interval' => 1, 'daysOfWeek' => ['wednesday'], 'index' => 'first'], $graph['recurrence']['pattern']);
        $this->assertSame(['dateTime' => '2025-08-06T14:00:00', 'timeZone' => 'Europe/Berlin'], $graph['start']);
        $this->assertSame(['dateTime' => '2025-08-06T15:00:00', 'timeZone' => 'Europe/Berlin'], $graph['end']);
    }
    public function test_last_weekday_and_setpos_rules_map_to_index(): void {
        $event = fn (string $rule) => GraphEvent::fromEvent(CalendarEvent::fromICal('x', "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:x\r\nRRULE:$rule\r\nDTSTART:20260130T090000Z\r\nDTEND:20260130T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"));

        $this->assertSame('last', $event('FREQ=MONTHLY;BYDAY=-1FR')['recurrence']['pattern']['index']);
        $this->assertSame(['monday', 'tuesday'], $event('FREQ=MONTHLY;BYDAY=MO,TU;BYSETPOS=2')['recurrence']['pattern']['daysOfWeek']);
        $this->assertSame(['type' => 'relativeYearly', 'interval' => 1, 'daysOfWeek' => ['sunday'], 'index' => 'last', 'month' => 3], $event('FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU')['recurrence']['pattern']);
        $this->assertArrayNotHasKey('recurrence', $event('FREQ=MONTHLY;BYDAY=1MO,3TU'));
        $this->assertSame(['dateTime' => '2026-01-30T09:00:00', 'timeZone' => 'UTC'], $event('FREQ=DAILY')['start']);
    }
    public function test_vcards_map_to_exchange_contacts(): void {
        $contact = GraphContact::fromVCard(implode("\r\n", [
            'BEGIN:VCARD', 'VERSION:3.0', 'FN:Jane Doe', 'N:Doe;Jane;;Dr.;', 'ORG:ACME GmbH;IT', 'TITLE:CTO',
            'EMAIL;TYPE=work:jane@acme.test', 'TEL;TYPE=cell:+49 171 1', 'TEL;TYPE=work:+49 89 2', 'TEL;TYPE=work:+49 89 3', 'TEL;TYPE=work:+49 89 4',
            'ADR;TYPE=work:;;Main St 1;Munich;;80331;DE', 'BDAY:1980-05-04', 'END:VCARD', '',
        ]));

        $this->assertSame('Jane Doe', $contact['displayName']);
        $this->assertSame('Doe', $contact['surname']);
        $this->assertSame('Dr.', $contact['title']);
        $this->assertSame('ACME GmbH', $contact['companyName']);
        $this->assertSame('IT', $contact['department']);
        $this->assertSame('+49 171 1', $contact['mobilePhone']);
        $this->assertSame(['+49 89 2', '+49 89 3'], $contact['businessPhones']);
        $this->assertSame(['street' => 'Main St 1', 'city' => 'Munich', 'postalCode' => '80331', 'countryOrRegion' => 'DE'], $contact['businessAddress']);
        $this->assertSame('1980-05-04T00:00:00Z', $contact['birthday']);
        $this->assertSame([['address' => 'jane@acme.test', 'name' => 'Jane Doe']], $contact['emailAddresses']);
    }
}
