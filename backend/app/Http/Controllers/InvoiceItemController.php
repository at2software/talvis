<?php

namespace App\Http\Controllers;

use App\Actions\CombineInvoiceItemsAction;
use App\Enums\InvoiceItemType;
use App\Models\InvoiceItem;
use Illuminate\Http\Request;

class InvoiceItemController extends Controller {
    public function indexStandingOrders() {
        $q = InvoiceItem::whereIn('type', InvoiceItemType::Repeating)->whereNot('next_recurrence_at', null)->with('company', 'productSource')->oldest('next_recurrence_at');
        if (request()->has('company_id')) {
            $q->whereCompanyId(request('company_id'));
        }
        return $q->get()->each->append('rootGroup');
    }
    public function destroy(InvoiceItem $invoiceItem) {
        if ($invoiceItem->deletionBlockers()) {
            abort(409, 'Already invoiced - correct it with a cancellation or credit note.');
        }
        return $invoiceItem->delete();
    }
    public function store(Request $request) {
        return InvoiceItem::create((new InvoiceItem)->getValidFields($request->all()))->fresh();
    }
    public function update(Request $request, int $id) {
        $item = InvoiceItem::findOrFail($id);
        $item->applyAndSave($request);
        return $item->fresh();
    }
    public function show(int $id) {
        return InvoiceItem::findOrFail($id);
    }
    public function reorder(Request $request) {
        $data = json_decode($request->getContent());
        foreach ($data->order as $key => $id) {
            $invoiceItem = InvoiceItem::find($id);
            if ($invoiceItem && $invoiceItem->position != $key) {
                $invoiceItem->position = $key;
                $invoiceItem->save();
            }
        }
    }
    public function combine(Request $request) {
        $request->validate([
            'item_ids'    => 'required|array|min:2',
            'item_ids.*'  => 'required|integer|exists:invoice_items,id',
            'description' => 'required|string',
        ]);

        $itemIds = $request->input('item_ids');
        $items   = InvoiceItem::whereIn('id', $itemIds)->get();

        if ($items->count() < 2) {
            return response()->json(['error' => 'At least 2 items are required'], 422);
        }

        $firstItem = $items->first();
        foreach ($items as $item) {
            if ($item->price !== $firstItem->price || $item->unit_name !== $firstItem->unit_name) {
                return response()->json(['error' => 'All items must have the same price and unit name'], 422);
            }
        }
        return (new CombineInvoiceItemsAction)->execute($itemIds, $request->input('description'));
    }
}
