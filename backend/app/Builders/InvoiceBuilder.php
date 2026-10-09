<?php

namespace App\Builders;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class InvoiceBuilder extends BaseBuilder {
    public function last12(Carbon $date) {
        return $this
            ->whereBetween('created_at', [$date->copy()->subYear(), $date])
            ->where(fn ($q) => $q->where('is_cancelled', false)->orWhereNull('is_cancelled'))
            ->get()->append('net');
    }
    public function revenue_12(Carbon $date) {
        return $this->last12($date)->sum(fn ($_) => $_->unmaskedNet());
    }
    public function withItems() {
        return $this->join('invoice_items', 'invoice_items.invoice_id', '=', 'invoices.id');
    }
    public function statsUid() {
        return $this->select(DB::raw("DATE_FORMAT(created_at, '%Y-%m') AS month"), DB::raw('SUM(total_net) AS sum'))->groupBy('month');
    }
    public function statsKeyVal() {
        return $this->withItems()->select(DB::raw("DATE_FORMAT(invoices.created_at, '%Y-%m') AS `key`"), DB::raw('SUM(invoice_items.net) AS `value`'))->groupBy('month');
    }
}
