<?php

namespace App\Traits;

use App\Http\Requests\Focus\LinkFociToInvoiceItemRequest;
use App\Models\Company;
use App\Models\Focus;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Product;
use App\Models\Project;
use App\Models\User;
use Auth;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

trait HasFociTrait {
    abstract protected function hasTimeBudget(): Attribute;
    protected static function bootHasFociTrait(): void {
        static::deleting(function ($_) {
            $_->foci()->delete();
        });
    }
    public function hoursInvestedSum() {
        return $this->hasOne(Focus::class, 'parent_id')
            ->where('parent_type', $this::class)
            ->selectRaw('parent_id, SUM(duration) as total')
            ->groupBy('parent_id');
    }
    protected function hoursInvested(): Attribute {
        return Attribute::make(
            get: fn () => $this->hoursInvestedSum?->total ?? 0
        );
    }
    public function foci() {
        return $this->hasManyMorph(Focus::class);
    }
    public function foci_unbilled(): HasMany {
        return $this->foci()->whereNull('invoiced_in_item_id')->where('is_unpaid', false);
    }
    public function foci_unpaid() {
        return $this->foci()->whereNull('invoiced_in_item_id')->where('is_unpaid', true)->clusterBy('started_at', '%Y-%m-%d', 'duration', 'day')->latest('day');
    }
    public function foci_unpaid_last_month() {
        $query = $this->foci()
            ->whereAfter(now()->subMonth(), 'started_at')
            ->whereNull('invoiced_in_item_id')
            ->where('is_unpaid', true)
            ->clusterBy('started_at', '%Y-%m-%d', 'duration', 'day')
            ->latest('day');
        return $query;
    }
    public function focussed_by() {
        return $this->hasManyMorph(User::class, 'current_focus');
    }
    public function latest_focus() {
        return $this->hasOneMorph(Focus::class)->whereUserId(Auth::id())->latest('started_at');
    }
    protected function uninvoicedHours(): Attribute {
        return Attribute::make(
            get: fn () => $this->foci_unbilled_sum_duration ?? $this->foci_unbilled()->sum('duration')
        );
    }
    protected function fociSum(): Attribute {
        return Attribute::make(
            get: fn () => $this->foci()->whereNull('invoice_item_id')->sum('duration')
        );
    }
    public function createInvoiceItemsFromFoci(?Request $request = null) {
        $request  = $request ?? request();
        $data     = json_decode($request->getContent());
        $price    = Param::get('INVOICE_HOURLY_WAGE')->value;
        $discount = 0;
        if (! count($data->itemIds)) {
            abort(400, 'no items selected');
        }

        $firstItem = Focus::findOrFail($data->itemIds[0]);
        $company   = $firstItem->rootCompany;
        $discount  = $company->param('INVOICE_DISCOUNT')->value ?? 0;

        $parent = $firstItem->parent;
        if (is_a($parent, Project::class) && $parent->individual_wage !== null) {
            $price    = $parent->individual_wage;
            $discount = 0;
        }

        $product  = Product::findOrFail($data->productId);
        $vat_rate = $company->vatCategory() === 'S' ? Param::get('INVOICE_DEFAULT_VAT')->value : 0;

        $newItem = null;
        foreach ($product->invoiceItems as $i) {
            $newItem = new InvoiceItem;
            $newItem->applyObject((array)$i);
            $newItem->product_source_id = $product->id;
            $newItem->text              = $data->desc;
            $newItem->product_id        = null;    // unassign from project
            $newItem->price             = $price;
            $newItem->qty               = $data->duration;
            $newItem->discount          = $discount;
            $newItem->vat_rate          = $vat_rate;
            $newItem->unit_name         = Param::get('INVOICE_HOUR_UNIT')->value;
            if ($this instanceof Company) {
                $newItem->company_id = $this->id;
            }
            if ($this instanceof Project) {
                $newItem->stage      = 1;
                $newItem->project_id = $this->id;
            }
            $newItem->save();
        }
        if ($newItem) {
            Focus::whereIn('id', $data->itemIds)->update(['invoiced_in_item_id' => $newItem->id]);
        }
        $this->touch();
        return $newItem->fresh(['productSource', 'company']);
    }

    /**
     * Assigns unbilled foci of this parent to an already existing, open invoice item
     * (e.g. a prepared SLA item spawned by cron:standing-orders). qty and price stay untouched.
     */
    public function linkFociToInvoiceItem(LinkFociToInvoiceItemRequest $request): InvoiceItem {
        $data     = $request->validated();
        $focusIds = array_values(array_unique(array_map('intval', $data['itemIds'])));

        return DB::transaction(function () use ($data, $focusIds) {
            $item = InvoiceItem::whereKey($data['invoiceItemId'])->lockForUpdate()->first();
            if (! $item || ! $this->ownsInvoiceItem($item) || $item->invoice_id !== null || $item->isRepeating()) {
                throw ValidationException::withMessages(['invoiceItemId' => 'The invoice item is not an open item of this parent.']);
            }

            $foci  = Focus::whereIn('id', $focusIds)->lockForUpdate()->get();
            $valid = $foci->filter(fn (Focus $f) => $f->parent_type === $this::class
                && (int)$f->parent_id === (int)$this->getKey()
                && $f->invoiced_in_item_id === null
                && ! $f->is_unpaid);
            if ($foci->count() !== count($focusIds) || $valid->count() !== count($focusIds)) {
                throw ValidationException::withMessages(['itemIds' => 'All foci must belong to this parent and must be unbilled.']);
            }

            Focus::whereIn('id', $focusIds)->update(['invoiced_in_item_id' => $item->id]);
            $this->touch();
            $item->touch();

            return $item->fresh(['productSource', 'company']);
        });
    }

    private function ownsInvoiceItem(InvoiceItem $item): bool {
        if ($this instanceof Project) {
            return (int)$item->project_id === (int)$this->getKey();
        }
        if ($this instanceof Company) {
            return (int)$item->company_id === (int)$this->getKey() && $item->project_id === null;
        }
        return false;
    }
}
