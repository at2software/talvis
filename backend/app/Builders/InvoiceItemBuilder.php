<?php

namespace App\Builders;

use App\Enums\InvoiceItemType;

class InvoiceItemBuilder extends BaseBuilder {
    public function indexed() {
        return $this->load('productSource');
    }
    public function whereActiveStandingOrder() {
        return $this->whereIn('type', InvoiceItemType::Repeating)->whereNotNull('next_recurrence_at');
    }
    public function whereInactiveStandingOrder() {
        return $this->whereIn('type', InvoiceItemType::Repeating)->whereNull('next_recurrence_at');
    }
    public function withFociStats() {
        return $this->withCount('billedFoci')->withSum('billedFoci', 'duration')->withSum('foci', 'duration');
    }
    public function onlyActive() {
        return $this->whereRaw('active LIKE "active"');
    }
}
