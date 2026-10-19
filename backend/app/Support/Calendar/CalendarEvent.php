<?php

namespace App\Support\Calendar;

use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Component\VEvent;
use Sabre\VObject\Reader;

final class CalendarEvent {
    /**
     * @param array<string, string|string[]> $recurrence RFC 5545 RRULE parts, e.g. ['FREQ' => 'YEARLY']
     */
    public function __construct(
        public readonly string $objectId,
        public readonly string $uid,
        public readonly string $title,
        public readonly DateTimeImmutable $start,
        public readonly DateTimeImmutable $end,
        public readonly bool $allDay,
        public readonly ?DateTimeInterface $updatedAt = null,
        public readonly array $recurrence = [],
        public readonly ?string $description = null,
        public readonly ?string $location = null,
    ) {}

    public static function fromICal(string $objectId, string $ical, ?DateTimeInterface $updatedAt = null): ?self {
        try {
            $calendar = Reader::read($ical);
        } catch (\Throwable $e) {
            return null;
        }
        $event = $calendar instanceof VCalendar ? $calendar->VEVENT : null;
        return $event instanceof VEvent ? self::fromVEvent($objectId, $event, $updatedAt) : null;
    }
    public static function fromVEvent(string $objectId, VEvent $event, ?DateTimeInterface $updatedAt = null): ?self {
        if (! isset($event->DTSTART)) {
            return null;
        }

        $allDay = ! $event->DTSTART->hasTime() || self::isDateOnly($event->DTSTART->getValue());
        $start  = self::moment($event->DTSTART->getValue(), $event->DTSTART->getDateTime());
        $end    = match (true) {
            isset($event->DTEND)    => self::moment($event->DTEND->getValue(), $event->DTEND->getDateTime()),
            isset($event->DURATION) => $start->add($event->DURATION->getDateInterval()),
            default                 => $start->modify($allDay ? '+1 day' : '+1 hour'),
        };

        return new self(
            objectId: $objectId,
            uid: (string)($event->UID ?? $objectId),
            title: trim((string)$event->SUMMARY),
            start: $start,
            end: $end,
            allDay: $allDay,
            updatedAt: $updatedAt,
            recurrence: isset($event->RRULE) ? $event->RRULE->getParts() : [],
            description: trim((string)$event->DESCRIPTION) ?: null,
            location: trim((string)$event->LOCATION) ?: null,
        );
    }

    /** @return list<self> */
    public static function occurrences(VCalendar $calendar, DateTimeInterface $from, DateTimeInterface $until): array {
        $occurrences = [];
        foreach ($calendar->expand($from, $until, new DateTimeZone(config('app.timezone')))->select('VEVENT') as $index => $event) {
            if ($occurrence = self::fromVEvent($index.'_'.$event->UID, $event)) {
                $occurrences[] = $occurrence;
            }
        }
        return $occurrences;
    }

    private static function isDateOnly(string $value): bool {
        return (bool)preg_match('/^\d{8}$/', $value);
    }
    private static function moment(string $value, DateTimeInterface $parsed): DateTimeImmutable {
        return self::isDateOnly($value) ? DateTimeImmutable::createFromFormat('!Ymd', $value) : DateTimeImmutable::createFromInterface($parsed);
    }
    public function overlaps(?DateTimeInterface $from, ?DateTimeInterface $until): bool {
        if ($this->recurrence) {
            return $until === null || $this->start < $until;
        }
        return ($from === null || $this->end > $from) && ($until === null || $this->start < $until);
    }
    public function etag(): string {
        return '"'.$this->objectId.'-'.($this->updatedAt?->getTimestamp() ?? 0).'"';
    }
    public function addTo(VCalendar $calendar): VEvent {
        $utc   = new DateTimeZone('UTC');
        $event = $calendar->add('VEVENT', array_filter([
            'UID'         => $this->uid,
            'DTSTAMP'     => ($this->updatedAt ? DateTimeImmutable::createFromInterface($this->updatedAt) : new DateTimeImmutable)->setTimezone($utc),
            'SUMMARY'     => $this->title,
            'DESCRIPTION' => $this->description,
            'LOCATION'    => $this->location,
        ], fn ($value) => $value !== null && $value !== ''));

        if ($this->allDay) {
            $event->add('DTSTART', $this->start->format('Ymd'), ['VALUE' => 'DATE']);
            $event->add('DTEND', $this->end->format('Ymd'), ['VALUE' => 'DATE']);
        } else {
            $event->add('DTSTART', $this->start->setTimezone($utc));
            $event->add('DTEND', $this->end->setTimezone($utc));
        }
        if ($this->recurrence) {
            $event->add('RRULE', $this->recurrence);
        }
        return $event;
    }
    public function toICal(): string {
        $calendar = new VCalendar(['PRODID' => '-//TALVIS//Company Calendar//EN']);
        $this->addTo($calendar);
        return $calendar->serialize();
    }
}
