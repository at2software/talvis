<?php

namespace App\Services;

use App\Enums\VacationState;
use App\Models\CalendarEntry;
use App\Models\Contact;
use App\Models\User;
use App\Models\Vacation;
use App\Support\Calendar\CalendarEvent;
use Carbon\Carbon;
use DateTimeImmutable;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Model;
use Sabre\VObject\Component\VCalendar;

class CompanyCalendar {
    private const UNKNOWN_BIRTHDAY = '1970-01-01';

    /** @return list<CalendarEvent> */
    public function events(?DateTimeInterface $from = null, ?DateTimeInterface $until = null): array {
        $events = [
            ...User::whereHasBirthday()->get()->map(fn (User $user) => $this->birthday('user', $user)),
            ...Contact::whereHasBirthday()->get()->map(fn (Contact $contact) => $this->birthday('contact', $contact)),
            ...$this->absences()->get()->map(fn (Vacation $vacation) => $this->absence($vacation)),
            ...CalendarEntry::all()->map(fn (CalendarEntry $entry) => CalendarEvent::fromICal('calendarEntry_'.$entry->id, $entry->vcalendar, $entry->updated_at)),
        ];
        return array_values(array_filter($events, fn (?CalendarEvent $event) => $event?->overlaps($from, $until)));
    }

    public function event(string $objectId): ?CalendarEvent {
        [$type, $id] = array_pad(explode('_', $objectId, 2), 2, null);
        return match ($type) {
            'user'          => ($user = User::find($id)) ? $this->birthday('user', $user) : null,
            'contact'       => ($contact = Contact::find($id)) ? $this->birthday('contact', $contact) : null,
            'vacation'      => ($vacation = $this->absences()->find($id)) ? $this->absence($vacation) : null,
            'calendarEntry' => ($entry = CalendarEntry::find($id)) ? CalendarEvent::fromICal($objectId, $entry->vcalendar, $entry->updated_at) : null,
            default         => null,
        };
    }

    /** @param iterable<CalendarEvent> $events */
    public static function toVCalendar(iterable $events, string $name): VCalendar {
        $calendar = new VCalendar([
            'PRODID'                          => '-//TALVIS//Company Calendar//EN',
            'X-WR-CALNAME'                    => $name,
            'X-PUBLISHED-TTL'                 => 'PT1H',
            'REFRESH-INTERVAL;VALUE=DURATION' => 'PT1H',
        ]);
        foreach ($events as $event) {
            $event->addTo($calendar);
        }
        return $calendar;
    }

    private function absences() {
        return Vacation::with('user')
            ->whereIn('state', [VacationState::Approved, VacationState::Sick])
            ->where('amount', '<=', 0)
            ->where(fn ($query) => $query->where('state', VacationState::Approved)->orWhere('ended_at', '>=', Carbon::tomorrow()));
    }
    private function absence(Vacation $vacation): ?CalendarEvent {
        if (! $vacation->user) {
            return null;
        }
        return new CalendarEvent(
            objectId: 'vacation_'.$vacation->id,
            uid: 'vacation-'.$vacation->id.'@nexus',
            title: ($vacation->state === VacationState::Sick ? 'Sickday' : 'Vacation').' of '.$vacation->user->name,
            start: $vacation->firstDay()->toDateTimeImmutable(),
            end: $vacation->endExclusive()->toDateTimeImmutable(),
            allDay: true,
            updatedAt: $vacation->updated_at,
        );
    }
    private function birthday(string $type, Model $person): ?CalendarEvent {
        if (! preg_match('/BDAY:(\d{4}-\d{2}-\d{2})/', (string)$person->getRawOriginal('vcard'), $match) || $match[1] === self::UNKNOWN_BIRTHDAY) {
            return null;
        }
        $day = new DateTimeImmutable($match[1]);
        return new CalendarEvent(
            objectId: $type.'_'.$person->id,
            uid: 'birthday-'.$type.'-'.$person->id.'@nexus',
            title: 'Birthday of '.$person->name,
            start: $day,
            end: $day->modify('+1 day'),
            allDay: true,
            updatedAt: $person->updated_at,
            recurrence: ['FREQ' => 'YEARLY'],
        );
    }
}
