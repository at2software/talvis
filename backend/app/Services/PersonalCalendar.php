<?php

namespace App\Services;

use App\Models\User;
use App\Support\Calendar\CalendarEvent;
use App\Support\Calendar\CalendarOccurrence;
use DateTimeImmutable;
use DateTimeInterface;
use DateTimeZone;
use Illuminate\Support\Facades\Cache;

class PersonalCalendar {
    private const EXTERNAL_CACHE_MINUTES = 15;

    public function __construct(private CompanyCalendar $companyCalendar) {}

    /** @return list<CalendarOccurrence> */
    public function occurrences(User $user, DateTimeInterface $from, DateTimeInterface $until, bool $withTeam): array {
        return [
            ...($withTeam ? $this->team($from, $until) : []),
            ...$this->exchange($user, $from, $until),
        ];
    }

    /** @return list<CalendarOccurrence> */
    private function team(DateTimeInterface $from, DateTimeInterface $until): array {
        $events  = $this->companyCalendar->events($from, $until);
        $sources = [];
        foreach ($events as $event) {
            $sources[$event->uid] = match (explode('_', $event->objectId, 2)[0]) {
                'user', 'contact' => 'birthdays',
                'vacation'        => 'absences',
                default           => 'team',
            };
        }
        $occurrences = CalendarEvent::occurrences(CompanyCalendar::toVCalendar($events, 'TALVIS'), $from, $until);
        return array_map(fn (CalendarEvent $event) => new CalendarOccurrence($sources[$event->uid] ?? 'team', $event, false), $occurrences);
    }

    /** @return list<CalendarOccurrence> */
    private function exchange(User $user, DateTimeInterface $from, DateTimeInterface $until): array {
        $graph = $user->usesMicrosoft365('M365_SYNC_CALENDAR') ? MicrosoftGraph::fromVault() : null;
        if (! $graph) {
            return [];
        }
        $cacheKey = 'planner_exchange_'.$user->id.'_'.$from->format('Ymd').'_'.$until->format('Ymd');
        try {
            $events = Cache::remember($cacheKey, now()->addMinutes(self::EXTERNAL_CACHE_MINUTES), fn () => $graph->calendarView($user->microsoft365Mailbox(), $from, $until));
        } catch (\Throwable $e) {
            report($e);
            return [];
        }
        $timezone = new DateTimeZone(config('app.timezone'));
        return array_values(array_filter(array_map(function (array $event) use ($timezone) {
            if ($event['isCancelled'] ?? false) {
                return null;
            }
            $allDay = (bool)($event['isAllDay'] ?? false);
            $start  = new DateTimeImmutable($event['start']['dateTime'], $timezone);
            $end    = new DateTimeImmutable($event['end']['dateTime'], $timezone);
            $entry  = new CalendarEvent(
                objectId: 'exchange_'.$event['id'],
                uid: (string)$event['id'],
                title: (string)($event['subject'] ?? ''),
                start: $allDay ? $start->setTime(0, 0) : $start,
                end: $allDay ? $end->setTime(0, 0) : $end,
                allDay: $allDay,
            );
            return new CalendarOccurrence('exchange', $entry, ($event['showAs'] ?? 'busy') !== 'free', private: true);
        }, $events)));
    }
}
