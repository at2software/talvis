<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\ProductGroup;
use Illuminate\Http\Request;

class ProductGroupController extends Controller {
    private function _trace($groups) {
        foreach ($groups as $group) {
            $this->_trace($group->child_groups);
            $group->products_min;
        }
    }
    public function index(Request $request) {
        $roots = ProductGroup::where('product_group_id', null)->latest('is_active')->get();
        $this->_trace($roots);
        return $roots;
    }
    public function indexCustomers(ProductGroup $_) {
        $productIds = $_->flatTraceProducts()->pluck('id');

        $all = Company::select('companies.*')
            ->selectRaw('SUM(invoice_items.net) as revenue')
            ->join('invoices', 'invoices.company_id', '=', 'companies.id')
            ->join('invoice_items', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->whereIn('invoice_items.product_source_id', $productIds)
            ->whereNotNull('invoice_items.invoice_id')
            ->groupBy('companies.id')
            ->orderByDesc('revenue')
            ->get();
        return [
            'customers'       => $all->take(20)->values(),
            'total_revenue'   => $all->sum('revenue'),
            'total_customers' => $all->count(),
        ];
    }
    public static function show(Request $request, int $id) {
        return ProductGroup::findOrFail($id);
    }
    public function update(Request $request, int $id) {
        return ProductGroup::findOrFail($id)->applyAndSave($request);
    }
    public function destroy(Request $request, int $id) {
        ProductGroup::findOrFail($id)->delete();
        return response()->json(true, 202);
    }
    public function store(Request $request) {
        $new = new ProductGroup;
        $new->applyAndSave($request);
        return $new;
    }
}
