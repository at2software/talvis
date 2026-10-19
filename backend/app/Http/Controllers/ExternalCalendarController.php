<?php

namespace App\Http\Controllers;

use App\Http\Requests\Calendar\ExternalCalendarRequest;
use App\Services\SafeUrlGuard;
use App\Support\Calendar\CalendarEvent;
use App\Support\Calendar\CalendarOccurrence;
use GuzzleHttp\Exception\TransferException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Log;
use Sabre\VObject\Component\VCalendar;
use Sabre\VObject\Reader;

class ExternalCalendarController extends Controller {
    private const TIMEOUT  = 30;
    private const MAX_DAYS = 400;

    public function occurrences(ExternalCalendarRequest $request, SafeUrlGuard $guard) {
        $from  = $request->date('start')->startOfDay();
        $until = $request->date('end')->startOfDay();
        abort_if($from->diffInDays($until) > self::MAX_DAYS, 422, 'Range too large');

        $headers = ['Accept' => 'text/calendar'];
        if ($request->filled('login')) {
            $headers['Authorization'] = 'Basic '.base64_encode($request->validated('login').':'.$request->validated('password'));
        }
        $host = (string)parse_url($request->validated('url'), PHP_URL_HOST);
        try {
            $response = $guard->send('GET', $request->validated('url'), $headers, self::TIMEOUT);
        } catch (ConnectionException|TransferException $e) {
            Log::warning('External calendar could not be loaded', ['host' => $host, 'error' => $e::class]);
            abort(502, 'Calendar server could not be reached');
        }
        abort_unless($response->successful(), 502, 'Calendar server answered with HTTP '.$response->status());

        $calendar = $this->parse($response->body());

        try {
            $events = CalendarEvent::occurrences($calendar, $from, $until);
        } catch (\Throwable $e) {
            abort(422, 'The calendar contains recurring entries that cannot be expanded');
        }
        $occurrences  = array_map(fn (CalendarEvent $event) => new CalendarOccurrence($request->validated('source'), $event, true, private: true), $events);
        return ['events' => array_map(fn (CalendarOccurrence $occurrence) => $occurrence->toArray(), $occurrences)];
    }
    private function parse(string $body): VCalendar {
        $body = ltrim($body, "\xEF\xBB\xBF \t\r\n");
        abort_if($body === '', 422, 'The calendar server returned an empty response');
        abort_if(str_starts_with($body, '<'), 422, 'The calendar server returned a web page instead of a calendar. Is the calendar public and is this its iCal/ICS link?');
        abort_unless(stripos($body, 'BEGIN:VCALENDAR') !== false, 422, 'The response is not in iCal format');
        try {
            $calendar = Reader::read($body, Reader::OPTION_FORGIVING | Reader::OPTION_IGNORE_INVALID_LINES);
        } catch (\Throwable $e) {
            $calendar = null;
        }
        abort_unless($calendar instanceof VCalendar, 422, 'The calendar could not be parsed');
        return $calendar;
    }
}
