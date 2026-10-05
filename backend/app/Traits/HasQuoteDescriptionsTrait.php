<?php

namespace App\Traits;

trait HasQuoteDescriptionsTrait {
    public function getQuoteDescriptions(): array {
        return array_values(array_map(
            fn (array $entry) => $entry['html'],
            array_filter($this->getQuoteDescriptionEntries(), fn (array $entry) => ! $entry['disabled'])
        ));
    }
    public function getQuoteDescriptionEntries(): array {
        $disabled = $this->disabled_quote_sources ?? [];
        $entries  = [];
        $groups   = collect();
        $sources  = $this->invoiceItems()
            ->whereNotNull('product_source_id')
            ->with('productSource.group')
            ->groupBy('product_source_id')
            ->get();

        foreach ($sources as $item) {
            $entries[] = ['key' => 'product:'.$item->productSource->id, 'html' => $item->productSource->quote];
            $groups    = $groups->merge($item->productSource->trace());
        }

        foreach ($groups->unique() as $group) {
            $entries[] = ['key' => 'group:'.$group->id, 'html' => $group->quote];
        }

        $entries = array_filter($entries, fn (array $entry) => strlen($entry['html']));
        return array_values(array_map(fn (array $entry) => $entry + ['disabled' => in_array($entry['key'], $disabled, true)], $entries));
    }
}
