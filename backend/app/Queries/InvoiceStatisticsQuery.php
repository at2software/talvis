<?php

namespace App\Queries;

use App\Models\Invoice;
use Illuminate\Support\Carbon;

class InvoiceStatisticsQuery {
    public function getLast12Months(?int $companyId = null) {
        $query = Invoice::query();

        if ($companyId) {
            $query->where('company_id', $companyId);
        }
        return $query->last12(now())->all();
    }
    public function calculateStackRevenue(array $stack): float {
        return array_sum(array_map(fn ($_) => $_->unmaskedNet(), $stack));
    }
    public function calculateWeightedRevenue(array $stack, Carbon $pivot): float {
        return array_sum(array_map(
            fn ($_) => $_->unmaskedNet() * max(1, 365 - $pivot->diffInDays($_->created_at)) / 365,
            $stack
        ));
    }
}
