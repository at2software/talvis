<?php

namespace App\Support\Calendar;

use DateTimeImmutable;
use DateTimeZone;

final class CalendarOccurrence {
    private const WORKDAY_START = '08:00';
    private const WORKDAY_END   = '18:00';

    public function __construct(
        public readonly string $source,
        public readonly CalendarEvent $event,
        public readonly bool $busy,
        public readonly bool $private = false,
    ) {}

    /** @return list<string> */
    public function days(): array {
        $days = [];
        $last = $this->localEnd()->modify('-1 second');
        for ($day = $this->localStart()->setTime(0, 0); $day <= $last; $day = $day->modify('+1 day')) {
            $days[] = $day->format('Y-m-d');
        }
        return $days ?: [$this->localStart()->format('Y-m-d')];
    }

    /**
     * @param list<self> $occurrences
     * @return array<string, list<self>>
     */
    public static function groupByDay(array $occurrences): array {
        $byDay = [];
        foreach ($occurrences as $occurrence) {
            foreach ($occurrence->days() as $day) {
                $byDay[$day][] = $occurrence;
            }
        }
        return $byDay;
    }

    /** @param iterable<self> $occurrences */
    public static function busyHoursOn(iterable $occurrences, string $day): float {
        $dayStart  = new DateTimeImmutable($day.' '.self::WORKDAY_START, self::timezone());
        $dayEnd    = new DateTimeImmutable($day.' '.self::WORKDAY_END, self::timezone());
        $intervals = [];
        foreach ($occurrences as $occurrence) {
            if (! $occurrence->busy || $occurrence->event->allDay) {
                continue;
            }
            $start = max($occurrence->localStart(), $dayStart);
            $end   = min($occurrence->localEnd(), $dayEnd);
            if ($end > $start) {
                $intervals[] = [$start->getTimestamp(), $end->getTimestamp()];
            }
        }
        sort($intervals);

        $seconds = 0;
        $cursor  = null;
        foreach ($intervals as [$start, $end]) {
            $start = max($start, $cursor ?? $start);
            if ($end > $start) {
                $seconds += $end - $start;
                $cursor = $end;
            }
        }
        return $seconds / 3600;
    }

    public function toArray(): array {
        $format = $this->event->allDay ? 'Y-m-d' : DATE_ATOM;
        return [
            'key'     => $this->source.'|'.$this->event->uid.'|'.$this->localStart()->format($format),
            'source'  => $this->source,
            'title'   => $this->event->title,
            'all_day' => $this->event->allDay,
            'start'   => $this->localStart()->format($format),
            'end'     => $this->localEnd()->format($format),
        ];
    }
    private function localStart(): DateTimeImmutable {
        return $this->event->allDay ? $this->event->start : $this->event->start->setTimezone(self::timezone());
    }
    private function localEnd(): DateTimeImmutable {
        return $this->event->allDay ? $this->event->end : $this->event->end->setTimezone(self::timezone());
    }
    private static function timezone(): DateTimeZone {
        return new DateTimeZone(config('app.timezone'));
    }
}
