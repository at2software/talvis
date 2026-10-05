<?php

namespace App\DAV;

use App\Enums\VacationState;
use App\Models\CalendarEntry;
use App\Models\Contact;
use App\Models\User;
use App\Models\Vacation;
use Carbon\Carbon;
use Sabre\CalDAV;
use Sabre\CalDAV\Backend\AbstractBackend;
use Sabre\CalDAV\Backend\PDO;
use Sabre\CalDAV\Backend\SchedulingSupport;
use Sabre\CalDAV\Backend\SubscriptionSupport;
use Sabre\CalDAV\Backend\SyncSupport;
use Sabre\DAV\PropPatch;

/**
 * based on Sabre\CalDAV\Backend\PDO;
 */
// class OwnCalDAVBackend extends AbstractBackend implements SyncSupport, SubscriptionSupport, SchedulingSupport
class OwnCalDAVBackend extends AbstractBackend {
    protected $pdo;

    public function __construct(\PDO $pdo) {
        $this->pdo = $pdo;
    }

    /**
     * Returns a list of calendars for a principal.
     *
     * Every project is an array with the following keys:
     *  * id, a unique id that will be used by other functions to modify the
     *    calendar. This can be the same as the uri or a database key.
     *  * uri. This is just the 'base uri' or 'filename' of the calendar.
     *  * principaluri. The owner of the calendar. Almost always the same as
     *    principalUri passed to this method.
     *
     * Furthermore it can contain webdav properties in clark notation. A very
     * common one is '{DAV:}displayname'.
     *
     * Many clients also require:
     * {urn:ietf:params:xml:ns:caldav}supported-calendar-component-set
     * For this property, you can just return an instance of
     * Sabre\CalDAV\Xml\Property\SupportedCalendarComponentSet.
     *
     * If you return {http://sabredav.org/ns}read-only and set the value to 1,
     * ACL will automatically be put in read-only mode.
     *
     * @param string $principalUri
     * @return array
     */
    public function getCalendarsForUser($principalUri) {
        $parts = explode('/', $principalUri);
        $email = isset($parts[1]) ? $parts[1] : '';
        if ($email == '') {
            return [];
        }

        if (! User::where('email', $email)->exists()) {
            return [];
        }

        $calendars = [];

        $calendar = [
            'id'                => [0, 0],
            'uri'               => 'default_calendar',
            '{DAV:}displayname' => 'Company Calendar',
            'principaluri'      => $principalUri,
            // 'principaluri' => 'principals/'.'birthdays',
            '{'.CalDAV\Plugin::NS_CALENDARSERVER.'}getctag'                  => null,
            '{http://sabredav.org/ns}sync-token'                             => '0',
            '{'.CalDAV\Plugin::NS_CALDAV.'}supported-calendar-component-set' => new CalDAV\Xml\Property\SupportedCalendarComponentSet(['VEVENT', 'VTODO', 'VJOURNAL']),
            '{'.CalDAV\Plugin::NS_CALDAV.'}schedule-calendar-transp'         => new CalDAV\Xml\Property\ScheduleCalendarTransp('opaque'),
            'share-resource-uri'                                             => '/ns/share/'.'0',
            '{http://sabredav.org/ns}read-only'                              => 1,
            'share-access'                                                   => 2,
            'read-only'                                                      => true,
        ];
        $calendars[] = $calendar;
        return $calendars;
    }

    private function getBirthdayFromVCard($vcard) {
        if (preg_match('/BDAY:(\d{4}-\d{2}-\d{2})/', $vcard, $matches)) {
            $birthday = $matches[1];
            if ($birthday === '1970-01-01') {
                return null;
            }
            return $birthday;
        }
        return null;
    }
    private function makeEtag($id, $updatedAt): string {
        $stamp = $updatedAt ? $updatedAt->getTimestamp() : 0;
        return '"'.$id.'-'.$stamp.'"';
    }
    private function getCalendarDataFromVcard($name, $vcard, $uid, $updatedAt = null) {
        $birthday = $this->getBirthdayFromVCard($vcard);
        if ($birthday === null) {
            return null;
        }
        $dtstamp = $updatedAt ? gmdate('Ymd\THis\Z', $updatedAt->getTimestamp()) : gmdate('Ymd\THis\Z');
        return "BEGIN:VCALENDAR\r\n".
               "VERSION:2.0\r\n".
               "BEGIN:VEVENT\r\n".
               'UID:'.$uid."\r\n".
               'DTSTAMP:'.$dtstamp."\r\n".
               'DTSTART;VALUE=DATE:'.date('Ymd', strtotime($birthday))."\r\n".
               'SUMMARY:Birthday of '.$name."\r\n".
               "RRULE:FREQ=YEARLY\r\n".
               "END:VEVENT\r\n".
               "END:VCALENDAR\r\n";
    }
    private function getCalendarDataFromVacation($vacation, $isSick = false) {
        $firstDay = Carbon::parse($vacation->started_at)->format('Ymd');
        if (empty($vacation->ended_at)) {
            $duration = ceil(abs($vacation->amount) / 8);
            $lastDay  = Carbon::parse($vacation->started_at)->addDays($duration - 1)->format('Ymd');
        } else {
            $lastDay = Carbon::parse($vacation->ended_at)->addDay()->format('Ymd');
        }
        if (empty($lastDay)) {
            return '';
        }
        $timestamp = $lastDay == $firstDay ? 'DTSTART;VALUE=DATE:'.$firstDay."\r\n" : 'DTSTART:'.$firstDay."\r\n";
        if ($firstDay != $lastDay) {
            $timestamp .= 'DTEND:'.$lastDay."\r\n";
        }

        $vacationType = $isSick ? 'Sickday' : 'Vacation';
        $dtstamp      = $vacation->updated_at ? gmdate('Ymd\THis\Z', $vacation->updated_at->getTimestamp()) : gmdate('Ymd\THis\Z');
        return "BEGIN:VCALENDAR\r\n".
                "VERSION:2.0\r\n".
                "BEGIN:VEVENT\r\n".
                'UID:vacation-'.$vacation->id.'@nexus'."\r\n".
                'DTSTAMP:'.$dtstamp."\r\n".
                $timestamp.
                'SUMMARY:'.$vacationType.' of '.$vacation->user->name."\r\n".
                "END:VEVENT\r\n".
                "END:VCALENDAR\r\n";
    }

    /**
     * Returns all calendar objects within a calendar.
     *
     * Every item contains an array with the following keys:
     *   * calendardata - The iCalendar-compatible calendar data
     *   * uri - a unique key which will be used to construct the uri. This can
     *     be any arbitrary string, but making sure it ends with '.ics' is a
     *     good idea. This is only the basename, or filename, not the full
     *     path.
     *   * lastmodified - a timestamp of the last modification time
     *   * etag - An arbitrary string, surrounded by double-quotes. (e.g.:
     *   '  "abcdef"')
     *   * size - The size of the calendar objects, in bytes.
     *   * component - optional, a string containing the type of object, such
     *     as 'vevent' or 'vtodo'. If specified, this will be used to populate
     *     the Content-Type header.
     *
     * Note that the etag is optional, but it's highly encouraged to return for
     * speed reasons.
     *
     * The calendardata is also optional. If it's not returned
     * 'getCalendarObject' will be called later, which *is* expected to return
     * calendardata.
     *
     * If neither etag or size are specified, the calendardata will be
     * used/fetched to determine these numbers. If both are specified the
     * amount of times this is needed is reduced by a great degree.
     *
     * @param mixed $calendarId
     * @return array
     */
    public function getCalendarObjects($calendarId) {
        return $this->getCalendarObjectsBetween($calendarId);
    }

    public function getCalendarObjectsBetween($calendarId, $start = null, $end = null) {
        if (! is_array($calendarId)) {
            throw new \InvalidArgumentException('The value passed to $calendarId is expected to be an array with a calendarId and an instanceId');
        }
        [$calendarId, $instanceId] = $calendarId;

        $result = [];
        if ($calendarId == 0) {
            foreach (User::whereHasBirthday()->get() as $user) {
                $calendarData = $this->getCalendarDataFromVcard($user->name, $user->vcard, 'birthday-user-'.$user->id.'@nexus', $user->updated_at);
                if ($calendarData === null) {
                    continue;
                }
                $result[] = [
                    'id'           => $user->id,
                    'uri'          => 'user_'.strval($user->id),
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($user->id, $user->updated_at),
                    'size'         => strlen($calendarData),
                    'calendardata' => $calendarData,
                    'component'    => 'vevent',
                ];
            }
            foreach (Contact::whereHasBirthday()->get() as $contact) {
                $calendarData = $this->getCalendarDataFromVcard($contact->name, $contact->vcard, 'birthday-contact-'.$contact->id.'@nexus', $contact->updated_at);
                if ($calendarData === null) {
                    continue;
                }
                $result[] = [
                    'id'           => $contact->id,
                    'uri'          => 'contact_'.strval($contact->id),
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($contact->id, $contact->updated_at),
                    'size'         => strlen($calendarData),
                    'calendardata' => $calendarData,
                    'component'    => 'vevent',
                ];
            }
            $vacations = Vacation::with(['grant', 'user'])
                ->whereIn('state', [VacationState::Approved, VacationState::Sick])
                ->where('amount', '<=', '0')
                ->get();
            foreach ($vacations as $vacation) {
                $isSick = false;
                if ($vacation->state == VacationState::Sick) {
                    if ($vacation->ended_at < Carbon::tomorrow()) {
                        continue;
                    }
                    $isSick = true;
                }
                if ($start != null && $vacation->started_at < $start && $vacation->ended_at < $start) {
                    continue;
                }
                if ($end != null && $vacation->started_at > $end && $vacation->ended_at > $end) {
                    continue;
                }
                $calendarData = $this->getCalendarDataFromVacation($vacation, $isSick);
                $result[]     = [
                    'id'           => $vacation->id,
                    'uri'          => 'vacation_'.strval($vacation->id),
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($vacation->id, $vacation->updated_at),
                    'size'         => strlen($calendarData),
                    'calendardata' => $calendarData,
                    'component'    => 'vevent',
                ];
            }
            foreach (CalendarEntry::cursor() as $calendarEntry) {
                $vcalendar = $calendarEntry->vcalendar;
                // preg_match('/DTSTART:(\d{8}T\d{6}Z)/', $vcalendar, $startMatches);
                // preg_match('/DTEND:(\d{8}T\d{6}Z)/', $vcalendar, $endMatches);
                // $startDateTime = isset($startMatches[1]) ? $startMatches[1] : null;
                // $endDateTime = isset($endMatches[1]) ? $endMatches[1] : null;
                // $startEvent = $startDateTime ? Carbon::createFromFormat('Ymd\THis\Z', $startDateTime, 'UTC') : null;
                // $endEvent = $endDateTime ? Carbon::createFromFormat('Ymd\THis\Z', $endDateTime, 'UTC') : null;
                // if($startEvent != null){
                //     if($start != null && $startEvent < $start){
                //         continue;
                //     }
                //     if($end != null && $startEvent > $end){
                //         continue;
                //     }
                // }
                // if($endEvent != null){
                //     if($start != null && $endEvent < $start){
                //         continue;
                //     }
                //     if($end != null && $endEvent > $end){
                //         continue;
                //     }
                // }
                $result[] = [
                    'id'           => $calendarEntry->id,
                    'uri'          => 'calendarEntry_'.strval($calendarEntry->id),
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($calendarEntry->id, $calendarEntry->updated_at),
                    'size'         => strlen($vcalendar),
                    'calendardata' => $vcalendar,
                    'component'    => 'vevent',
                ];
            }
        }
        return $result;
    }

    /**
     * Returns information from a single calendar object, based on it's object
     * uri.
     *
     * The object uri is only the basename, or filename and not a full path.
     *
     * The returned array must have the same keys as getCalendarObjects. The
     * 'calendardata' object is required here though, while it's not required
     * for getCalendarObjects.
     *
     * This method must return null if the object did not exist.
     *
     * @param mixed $calendarId
     * @param string $objectUri
     * @return array|null
     */
    public function getCalendarObject($calendarId, $objectUri) {
        if (! is_array($calendarId)) {
            throw new \InvalidArgumentException('The value passed to $calendarId is expected to be an array with a calendarId and an instanceId');
        }
        [$calendarId, $instanceId] = $calendarId;
        [$prefix, $id]             = explode('_', $objectUri);

        if ($calendarId == 0) {
            if ($prefix == 'user') {
                $user = User::find($id);
                if (empty($user)) {
                    return [];
                }
                $calendardata = $this->getCalendarDataFromVcard($user->name, $user->vcard, 'birthday-user-'.$user->id.'@nexus', $user->updated_at);
                if ($calendardata === null) {
                    return [];
                }
                return [
                    'id'           => $user->id,
                    'uri'          => $objectUri,
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($user->id, $user->updated_at),
                    'size'         => strlen($calendardata),
                    'calendardata' => $calendardata,
                    'component'    => 'vevent',
                ];
            }
            if ($prefix == 'contact') {
                $contact = Contact::find($id);
                if (empty($contact)) {
                    return [];
                }
                $calendardata = $this->getCalendarDataFromVcard($contact->name, $contact->vcard, 'birthday-contact-'.$contact->id.'@nexus', $contact->updated_at);
                if ($calendardata === null) {
                    return [];
                }
                return [
                    'id'           => $contact->id,
                    'uri'          => $objectUri,
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($contact->id, $contact->updated_at),
                    'size'         => strlen($calendardata),
                    'calendardata' => $calendardata,
                    'component'    => 'vevent',
                ];
            }
            if ($prefix == 'vacation') {
                $vacation = Vacation::find($id);
                if (empty($vacation)) {
                    return [];
                }
                $isSick = false;
                if ($vacation->state == VacationState::Sick) {
                    if ($vacation->ended_at < Carbon::tomorrow()) {
                        return [];
                    }
                    $isSick = true;
                }
                $calendardata = $this->getCalendarDataFromVacation($vacation, $isSick);
                return [
                    'id'           => $vacation->id,
                    'uri'          => $objectUri,
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($vacation->id, $vacation->updated_at),
                    'size'         => strlen($calendardata),
                    'calendardata' => $calendardata,
                    'component'    => 'vevent',
                ];
            }
            if ($prefix == 'calendarEntry') {
                $calendarEntry = CalendarEntry::find($id);
                if (empty($calendarEntry)) {
                    return [];
                }
                $calendardata = $calendarEntry->vcalendar;
                return [
                    'id'           => $calendarEntry->id,
                    'uri'          => $objectUri,
                    'lastmodified' => null,
                    'etag'         => $this->makeEtag($calendarEntry->id, $calendarEntry->updated_at),
                    'size'         => strlen($calendardata),
                    'calendardata' => $calendardata,
                    'component'    => 'vevent',
                ];
            }
        }
        return [];
    }

    /**
     * Returns a list of calendar objects.
     *
     * This method should work identical to getCalendarObject, but instead
     * return all the calendar objects in the list as an array.
     *
     * If the backend supports this, it may allow for some speed-ups.
     *
     * @param mixed $calendarId
     * @return array
     */
    public function getMultipleCalendarObjects($calendarId, array $uris) {
        if (! is_array($calendarId)) {
            throw new \InvalidArgumentException('The value passed to $calendarId is expected to be an array with a calendarId and an instanceId');
        }
        [$calendarId, $instanceId] = $calendarId;

        $result = [];
        foreach ($uris as $uri) {
            $result[] = $this->getCalendarObject([$calendarId, $calendarId], $uri);
        }
        return $result;
    }

    /**
     * Performs a calendar-query on the contents of this calendar.
     *
     * The calendar-query is defined in RFC4791 : CalDAV. Using the
     * calendar-query it is possible for a client to request a specific set of
     * object, based on contents of iCalendar properties, date-ranges and
     * iCalendar component types (VTODO, VEVENT).
     *
     * This method should just return a list of (relative) urls that match this
     * query.
     *
     * The list of filters are specified as an array. The exact array is
     * documented by \Sabre\CalDAV\CalendarQueryParser.
     *
     * Note that it is extremely likely that getCalendarObject for every path
     * returned from this method will be called almost immediately after. You
     * may want to anticipate this to speed up these requests.
     *
     * This method provides a default implementation, which parses *all* the
     * iCalendar objects in the specified calendar.
     *
     * This default may well be good enough for personal use, and calendars
     * that aren't very large. But if you anticipate high usage, big calendars
     * or high loads, you are strongly advised to optimize certain paths.
     *
     * The best way to do so is override this method and to optimize
     * specifically for 'common filters'.
     *
     * Requests that are extremely common are:
     *   * requests for just VEVENTS
     *   * requests for just VTODO
     *   * requests with a time-range-filter on a VEVENT.
     *
     * ..and combinations of these requests. It may not be worth it to try to
     * handle every possible situation and just rely on the (relatively
     * easy to use) CalendarQueryValidator to handle the rest.
     *
     * Note that especially time-range-filters may be difficult to parse. A
     * time-range filter specified on a VEVENT must for instance also handle
     * recurrence rules correctly.
     * A good example of how to interpret all these filters can also simply
     * be found in \Sabre\CalDAV\CalendarQueryFilter. This class is as correct
     * as possible, so it gives you a good idea on what type of stuff you need
     * to think of.
     *
     * This specific implementation (for the PDO) backend optimizes filters on
     * specific components, and VEVENT time-ranges.
     *
     * @param mixed $calendarId
     * @return array
     */
    public function calendarQuery($calendarId, array $filters) {
        $startDateTime = isset($filters['comp-filters'][0]['time-range']['start'])
            ? $filters['comp-filters'][0]['time-range']['start']->format('Y-m-d H:i:s')
            : null;
        $endDateTime = isset($filters['comp-filters'][0]['time-range']['end'])
            ? $filters['comp-filters'][0]['time-range']['end']->format('Y-m-d H:i:s')
            : null;

        $startCarbon = $startDateTime ? Carbon::createFromFormat('Y-m-d H:i:s', $startDateTime, 'UTC') : null;
        $endCarbon   = $endDateTime ? Carbon::createFromFormat('Y-m-d H:i:s', $endDateTime, 'UTC') : null;

        $result = $this->getCalendarObjectsBetween($calendarId, $startCarbon, $endCarbon);
        $result = array_column($result, 'uri');
        return $result;
    }

    public function createCalendar($principalUri, $calendarUri, array $properties) {
        // Not implemented
        return '';
    }
    public function updateCalendar($calendarId, PropPatch $propPatch) {
        // Not implemented
    }
    public function deleteCalendar($calendarId) {
        // Not implemented
    }
    public function createCalendarObject($calendarId, $objectUri, $calendarData) {
        // Not implemented
        return '';
    }
    public function updateCalendarObject($calendarId, $objectUri, $calendarData) {
        // Not implemented
    }
    public function deleteCalendarObject($calendarId, $objectUri) {
        // Not implemented
    }
}
