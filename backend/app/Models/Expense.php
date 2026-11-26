<?php

namespace App\Models;

use App\Enums\InvoiceItemType;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Expense extends BaseModel {
    use HasFactory;

    protected function casts(): array {
        return [
            'price'  => 'double',
            'repeat' => InvoiceItemType::class,
        ];
    }
    public function category() {
        return $this->belongsTo(ExpenseCategory::class);
    }
    public function invoiceItem() {
        return $this->belongsTo(InvoiceItem::class);
    }
    public function yearlySum() {
        return $this->price * ($this->repeat?->perYear() ?? 0);
    }
}
