<?php

namespace App\Http\Controllers;

use App\Models\Param;
use App\Models\StringParam;
use App\Models\User;
use App\Services\CompanyCalendar;
use Illuminate\Support\Str;

class CalendarFeedController extends Controller {
    private const TOKEN_PARAM = 'CALENDAR_FEED_TOKEN';

    public function show(string $token, CompanyCalendar $calendar) {
        $owner = StringParam::where('param_id', Param::get(self::TOKEN_PARAM)->id)
            ->where('parent_type', User::class)
            ->where('value', $token)
            ->latest('id')
            ->first();
        abort_unless($owner && hash_equals((string)User::find($owner->parent_id)?->param(self::TOKEN_PARAM)->value, $token), 404);

        $document = CompanyCalendar::toVCalendar($calendar->events(), config('app.name'));
        return response($document->serialize(), 200, ['Content-Type' => 'text/calendar; charset=utf-8']);
    }
    public function showUrl() {
        $param = request()->user()->param(self::TOKEN_PARAM);
        if (! $param->value) {
            return $this->rotate();
        }
        return ['url' => $this->urlFor($param->value)];
    }
    public function rotate() {
        $param        = request()->user()->param(self::TOKEN_PARAM);
        $param->value = Str::random(48);
        $param->save();
        return ['url' => $this->urlFor($param->value)];
    }
    private function urlFor(string $token): string {
        return rtrim(config('app.api_url'), '/').'/caldav/feed/'.$token.'.ics';
    }
}
