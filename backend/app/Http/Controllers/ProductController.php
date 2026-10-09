<?php

namespace App\Http\Controllers;

use App\Models\Company;
use App\Models\InvoiceItem;
use App\Models\Product;
use App\Models\ProductGroup;
use App\Services\ProductStatisticsService;
use Illuminate\Http\Request;

class ProductController extends Controller {
    public static function index(Request $request) {
        return ProductGroup::indexAll();
    }
    public static function show(Request $request, Product $product) {
        return $product->load('invoiceItems');
    }
    public function update(Request $request, int $id) {
        return Product::findOrFail($id)->applyAndSave($request);
    }
    public function destroy(Request $request, int $id) {
        Product::findOrFail($id)->delete();
        return response()->json(true, 202);
    }
    public function store(Request $request) {
        $new = new Product;
        $new->applyAndSave($request);
        $i = new InvoiceItem(['product_id' => $new->id]);
        $i->save();
        $new->invoiceItems;
        return $new;
    }
    public function indexCustomers(Product $_) {
        $all = Company::select('companies.*')
            ->selectRaw('SUM(invoice_items.net) as revenue')
            ->join('invoices', 'invoices.company_id', '=', 'companies.id')
            ->join('invoice_items', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->where('invoice_items.product_source_id', $_->id)
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
    public function showSplit(Request $request, int $id) {
        $invoiceItems = InvoiceItem::whereNotNull('project_id')
            ->whereNotNull('product_source_id')
            ->where('product_source_id', $id)
            ->with(['project:id,name,description', 'product:id,name'])
            ->get()
            ->map(function ($item) {
                return [
                    'id'                  => $item->id,
                    'text'                => $item->text,
                    'project_name'        => $item->project?->name,
                    'project_description' => $item->project?->description,
                    'net'                 => $item->net,
                    'created_at'          => $item->created_at,
                ];
            });
        return $invoiceItems;
    }
    public function indexRootGroups() {
        return ProductGroup::whereNull('product_group_id')->get();
    }
    public function showStatistics(Request $request): array {
        return (new ProductStatisticsService)->getStatistics($request);
    }
}
