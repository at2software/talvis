<?php

namespace App\Http\Controllers;

use App\DAV\OwnCalDAVBackend;
use App\Http\Requests\Calendar\StoreCalendarRequest;
use App\Models\CalendarEntry;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CalendarController extends Controller {
    public function index() {
        $pdo               = DB::connection()->getPdo();
        $ownCalDAVBackend  = new OwnCalDAVBackend($pdo);
        $calendarObjects   = $ownCalDAVBackend->getCalendarObjects([0, 0]);
        $index             = 1;
        $calendarDataArray = collect($calendarObjects)
            ->filter(fn ($calendarObject) => isset($calendarObject['uri'], $calendarObject['calendardata']) && strpos($calendarObject['uri'], 'calendarEntry_') !== 0)
            ->map(function ($calendarObject) use (&$index) {
                return [
                    'id'          => -1 * $index++,
                    'vcalendar'   => $calendarObject['calendardata'],
                    'is_editable' => false,
                ];
            })
            ->filter()
            ->values()
            ->toArray();

        $calendarEntries   = CalendarEntry::select(['id', 'vcalendar'])->get();
        $calendarDataArray = array_merge($calendarDataArray, $calendarEntries->map(function ($calendarEntry) {
            return [
                'id'          => $calendarEntry->id,
                'vcalendar'   => $calendarEntry->vcalendar,
                'is_editable' => true,
            ];
        })->toArray());
        return response()->json($calendarDataArray);
    }
    public function store(StoreCalendarRequest $request) {
        $vcalendar = $request->validated('vcalendar');
        if (! preg_match('/^UID:/m', $vcalendar)) {
            $newUID         = (string)Str::uuid();
            $vcalendarLines = explode("\n", $vcalendar);
            array_splice($vcalendarLines, 1, 0, "UID:$newUID");
            $vcalendar = implode("\n", $vcalendarLines);
        }
        return CalendarEntry::create([
            'vcalendar' => $vcalendar,
        ]);
    }
    public function update(StoreCalendarRequest $request, CalendarEntry $calendarEntry) {
        $calendarEntry->vcalendar = $request->validated('vcalendar');
        $calendarEntry->save();
        return $calendarEntry;
    }
    public function destroy(CalendarEntry $calendarEntry) {
        return response()->json($calendarEntry->delete());
    }
}
