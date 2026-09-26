<?php

namespace App\Models;

use App\Casts\PrecomputedAuth;
use App\Traits\HasInvoiceItemsTrait;
use App\Traits\PrecomputedTrait;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Collection;

class Product extends BaseModel {
    use HasFactory;
    use HasInvoiceItemsTrait;
    use PrecomputedTrait;
    use SoftDeletes;

    protected $appends  = ['icon', 'class', 'path', 'rootGroup'];
    protected $hidden   = ['group'];
    protected $with     = ['group.parent_group'];
    protected $fillable = ['name', 'item_number', 'is_active', 'is_discountable', 'time_based', 'price_multiplier', 'recurrence', 'minimum_amount', 'package_amount', 'minimum_price', 'weight', 'size_w', 'size_h', 'size_d', 'quote', 'product_group_id', 'created_at', 'updated_at'];
    protected $touches  = ['group'];

    protected function casts(): array {
        return [
            'net' => PrecomputedAuth::class,
        ];
    }
    public function getIconAttribute() {
        return '../icons/product.jpg';
    }
    public function getRootGroupAttribute() {
        $group = $this->group;
        while ($group?->parent_group) {
            $group = $group->parent_group;
        }
        return $group;
    }
    public function precomputeNetAttribute() {
        return $this->refs()->sum('net');
    }
    public function group() {
        return $this->belongsTo(ProductGroup::class, 'product_group_id');
    }
    public function refs() {
        return $this->hasMany(InvoiceItem::class, 'product_source_id')->where('invoice_id', '>', 0);
    }
    public function customers() {
        return $this->refs()->whereHas('invoice')->with('invoice.company');
    }
    public function invoiceItems() {
        return $this->hasMany(InvoiceItem::class, 'product_id');
    }
    public function indexedItems() {
        return $this->invoiceItems()->with('productSource')->oldest('position');
    }
    public function trace(): Collection {
        $data = collect();
        $obj  = $this->group;
        while ($obj) {
            $data->push($obj);
            $obj = $obj->parent_group;
        }
        return $data;
    }
    public function activate(bool $is_active) {
        $this->is_active = $is_active;
        $this->save();
        return $this;
    }
}
