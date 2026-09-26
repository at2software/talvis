<?php

namespace App\Http\Controllers;

use App\Actions\UndoInvoiceAction;
use App\Models\File;
use App\Models\Invoice;
use App\Models\Param;
use App\Services\CashFlowService;
use App\Services\InvoiceStatisticsService;
use App\Services\LiquidityService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

class InvoiceController extends Controller {
    public function _index(Request $r) {
        $query = Invoice::select()->whereRequest()->withRequest();
        if (@$r->input('onlyUnpaid') == 'true') {
            $query = $query->where('paid_at', null);
        }
        if (@$r->input('onlyPaid') == 'true') {
            $query = $query->where('paid_at', 'is not', null);
        }
        // $query->whereNull('cancellation_invoice_id');
        $query->with('cancelledBy', 'cancelles');
        $query->latest();
        return $query;
    }
    public function index(Request $r) {
        $query = $this->_index($r)->oldest('due_at');
        $query = $query->with(['company', 'reminders']);

        $replies = $query->paginate(25)->withQueryString();
        $replies->appends(request()->input())->links();
        $replies->getCollection();
        return $replies;
    }
    public function indexInvoiceItems(Invoice $_) {
        return $_->indexedItems()->get();
    }
    public function probe(Request $request) {
        return ['count' => $this->_index($request)->count()];
    }
    public function show(Invoice $invoice) {
        return $invoice->load('company');
    }
    public function showPdf(Invoice $_) {
        if (! Storage::exists($_->file_dir)) {
            return response()->json(['error' => 'PDF not found'], 404);
        }
        return File::stream($_->file_dir, $_->name);
    }
    public function update(Request $request, Invoice $invoice) {
        if ($request->filled('paid')) {
            $invoice->paid_at = $request->boolean('paid') ? now() : null;
        }
        $invoice->applyAndSave($request);
        return $invoice;
    }
    public function updateValues(Invoice $_) {
        $_->net             = null;
        $_->gross           = null;
        $_->gross_remaining = null;
        return $_->save();
    }
    public function updateCancel(Invoice $_) {
        return $_->cancel();
    }
    public function updateUndo(Invoice $_) {
        return (new UndoInvoiceAction)->execute($_);
    }
    public function sendMail(Invoice $_) {
        if (config('app.talvis_debug')) {
            return;
        }
        return $_->sendMail();
    }
    public function sendReminder(Invoice $_) {
        if (config('app.talvis_debug')) {
            return;
        }
        return $_->sendReminder();
    }
    public function sendToDatev(Invoice $_) {
        if (config('app.talvis_debug')) {
            return;
        }
        Invoice::disablePropagation();
        try {
            if ($mailTo = Param::get('DATEV_MAIL_OUTGOING')->value) {
                Mail::send([], [], fn ($message) => $message->to($mailTo)
                    ->subject($_->name)
                    ->text($_->name)
                    ->attach(Attachment::fromStorage($_->file_dir))
                );

                $_->setFlag(Invoice::FLAG_SENT_TO_DATEV);
                $_->save();
                return $_;
            }
        } finally {
            Invoice::enablePropagation();
        }
    }
    public function showCashFlow() {
        return CashFlowService::getCashFlowData();
    }
    public function showLiquidity() {
        return LiquidityService::getLiquidityData();
    }
    public function uploadBankCsv(Request $request) {
        if (! $request->hasFile('file')) {
            return response(['error' => 'No file uploaded'], 400);
        }

        $result = CashFlowService::importBankCsv($request->file('file'));

        if (isset($result['error'])) {
            return response(['error' => $result['error']], 400);
        }
        return response($result, 200);
    }
    public static function getPdf($object) {
        $template = file_get_contents('../resources/letter.html');
        $content  = '';
        $template = str_replace('{{content}}', $content, $template);
        $pdf      = Pdf::loadHTML($template);
        return $pdf->stream();
    }
    public function getCustomerStats() {
        return InvoiceStatisticsService::getCustomerStats();
    }
    public function indexMonthlyRevenueRanges() {
        return InvoiceStatisticsService::getMonthlyRevenueRanges();
    }
    public function indexMonthlySpiralRevenue() {
        return InvoiceStatisticsService::getMonthlySpiralRevenue();
    }
}
