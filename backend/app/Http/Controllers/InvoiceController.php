<?php

namespace App\Http\Controllers;

use App\Actions\CreateSepaDirectDebitAction;
use App\Actions\UndoInvoiceAction;
use App\Http\Requests\Invoice\StoreSepaDirectDebitRequest;
use App\Models\File;
use App\Models\Invoice;
use App\Models\Param;
use App\Services\CashFlowService;
use App\Services\InvoiceStatisticsService;
use App\Services\LiquidityService;
use App\Traits\HasParams;
use Barryvdh\DomPDF\Facade\Pdf;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Support\Facades\Mail;

class InvoiceController extends Controller {
    public function _index(Request $r) {
        $query = Invoice::select()->whereRequest()->withRequest();
        if (@$r->input('onlyUnpaid') == 'true') {
            $query = $query->where('paid_at', null);
        }
        if (@$r->input('onlyPaid') == 'true') {
            $query = $query->whereNotNull('paid_at');
        }
        // $query->whereNull('cancellation_invoice_id');
        $query->with('cancelledBy', 'cancelles');
        $query->latest();
        return $query;
    }
    public function index(Request $r) {
        $query = $this->_index($r)->oldest('due_at');
        $query = $query->with(['company' => fn ($query) => $query->with(HasParams::$WITH), 'reminders']);

        $replies = $query->paginate(25)->withQueryString();
        $replies->appends(request()->input())->links();
        $replies->getCollection()->each(fn (Invoice $invoice) => $invoice->company?->append('has_direct_debit'));
        return $replies;
    }
    public function indexInvoiceItems(Invoice $_) {
        return $_->indexedItems()->get();
    }
    public function probe(Request $request) {
        return ['count' => $this->_index($request)->count()];
    }
    public function show(Invoice $invoice) {
        $invoice->load(['company' => fn ($query) => $query->with(HasParams::$WITH)]);
        $invoice->company?->append('has_direct_debit');
        return $invoice;
    }
    public function showPdf(Invoice $_) {
        if (! $_->hasPdf()) {
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
        return response()->json($_->save());
    }
    public function updateCancel(Invoice $_) {
        return $_->cancel();
    }
    public function updateUndo(Invoice $_) {
        return (new UndoInvoiceAction)->execute($_);
    }
    public function sendMail(Invoice $_) {
        if (config('app.talvis_debug')) {
            return $_;
        }
        return $_->sendMail();
    }
    public function sendReminder(Invoice $_) {
        if (config('app.talvis_debug')) {
            return $_;
        }
        return $_->sendReminder();
    }
    public function sendToDatev(Invoice $_) {
        if (config('app.talvis_debug')) {
            return $_;
        }
        abort_unless($_->hasPdf(), 409, 'Invoice has no PDF to send');
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
        return $_;
    }
    public function indexSepaDirectDebits() {
        return Invoice::whereNull('paid_at')
            ->where('is_cancelled', false)
            ->with(['company' => fn ($query) => $query->with(HasParams::$WITH)])
            ->latest()
            ->get()
            ->filter(fn (Invoice $invoice) => $invoice->company?->has_direct_debit)
            ->each(fn (Invoice $invoice) => $invoice->setAttribute('sepa', [
                'amount'    => $invoice->unmaskedGrossRemaining(),
                'collected' => $invoice->getFlag(Invoice::FLAG_SEPA_COLLECTED),
                'issues'    => $invoice->sepaDirectDebitIssues(),
            ]))
            ->values();
    }
    public function storeSepaDirectDebit(StoreSepaDirectDebitRequest $request, CreateSepaDirectDebitAction $action) {
        $invoices = Invoice::whereKey($request->validated('invoice_ids'))
            ->with(['company' => fn ($query) => $query->with(HasParams::$WITH)])
            ->get();

        $blocked = $invoices->mapWithKeys(fn (Invoice $invoice) => [
            $invoice->name => $invoice->paid_at || $invoice->is_cancelled ? ['settled'] : $invoice->sepaDirectDebitIssues(),
        ])->filter();
        if ($blocked->isNotEmpty()) {
            return response()->json(['message' => 'Some invoices cannot be collected.', 'errors' => $blocked], 422);
        }

        $collectionDate = Carbon::createFromFormat('Y-m-d', $request->validated('collection_date'))->startOfDay();
        $xml            = $action->execute($invoices, $collectionDate);
        return response($xml)->withHeaders(File::headers('SEPA-Lastschrift-'.$collectionDate->format('Y-m-d').'.xml', 'application/xml'));
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
