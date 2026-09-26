<?php

namespace App\Traits;

use App\Enums\InvoiceItemType;
use App\Models\DeletionLog;
use App\Models\InvoiceItem;

trait HasInvoiceItemsTrait {
    protected static function bootHasInvoiceItemsTrait(): void {
        static::deleted(function ($_) {
            DeletionLog::withoutLogging(fn () => $_->invoiceItems()->get()->each->delete());
        });
        static::restoring(function ($_) {
            $_->invoiceItems()
                ->onlyTrashed()
                ->where('deleted_at', '>=', $_->deleted_at)
                ->get()
                ->each->restore();
        });
    }
    public function invoiceItems() {
        return $this->hasMany(InvoiceItem::class);
    }
    public function repeatingItems() {
        return $this->hasMany(InvoiceItem::class)->whereIn('type', InvoiceItemType::Repeating)->with('productSource')->oldest('position');
    }
    public function indexedItems() {
        return $this->hasMany(InvoiceItem::class)->with('productSource')->whereNull('invoice_id')->oldest('position');
    }
    public function supportItems() {
        return $this->invoiceItems()->whereStage(1)->whereIn('type', InvoiceItemType::TotalRemaining)->whereInvoiceId(null);
    }
    public static function getAllWithSupportItems() {
        return self::whereHasSupportItems()
            ->withSum('supportItems as net_remaining', 'net')
            ->with(['supportItems' => function ($q) {
                $q->select('id', 'company_id', 'project_id', 'created_at', 'net', 'type')
                    ->orderBy('created_at', 'asc')
                    ->limit(1);
            }])
            ->get();
    }
}
