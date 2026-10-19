<?php

namespace App\Services;

use App\Enums\Recurrence;
use App\Models\Company;
use App\Models\Param;

class MarketingRemarketingService {
    public static function getRemarketingData(): array {
        $total    = Param::get('INVOICE_REVENUE_12M')->value;
        $observed = self::observed();
        return [
            'due'      => self::due($observed),
            'observed' => $observed
                ->map(function ($_) {
                    $_->revenue_12 = $_->param('INVOICE_REVENUE_12M')->value;
                    return $_;
                })
                ->sortByDesc('revenue_12')
                ->values(),
            'suggested' => Company::query()
                ->where('remarketing_interval', Recurrence::None)
                ->whereHas('latestRevenue12Param', fn ($_) => $_->where('value', '>', 0.05 * $total))
                ->with('latestRevenue12Param')
                ->withLastContact()
                ->get()
                ->map(function ($_) {
                    $_->setAttribute('revenue_12', $_->latestRevenue12Param?->value);
                    return $_->resolveLastContact();
                })
                ->sortByDesc('revenue_12')
                ->values(),
        ];
    }
    public static function getRemarketingDue() {
        return self::due(self::observed());
    }
    private static function due($observed) {
        return $observed
            ->filter(fn ($_) => $_->remarketing_due_at->isPast())
            ->sortBy('remarketing_due_at')
            ->values();
    }
    private static function observed() {
        return Company::whereNot('remarketing_interval', Recurrence::None)
            ->withLastContact()
            ->get()
            ->map(function ($_) {
                $_->resolveLastContact();
                $_->setAttribute('remarketing_due_at', Recurrence::add($_->remarketing_interval, $_->last_contacted_at ?? $_->created_at));
                return $_;
            });
    }
}
