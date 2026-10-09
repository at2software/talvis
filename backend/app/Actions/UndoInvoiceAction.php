<?php

namespace App\Actions;

use App\Models\Invoice;
use App\Models\Param;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class UndoInvoiceAction {
    public function execute(Invoice $invoice): Response|JsonResponse {
        $invoiceNumber = Invoice::getCurrentInvoiceNumber(-1)['value'];

        if ($invoice->name !== $invoiceNumber) {
            abort(403, 'Can only undo the latest invoice');
        }

        $firstItem = $invoice->invoiceItems()->first();
        $invoice->releaseItems();
        $invoice->delete();

        return response([
            'status'             => 'Successfully undone',
            'item'               => $firstItem ?? null,
            'INVOICE_NO_CURRENT' => Param::incrementNumber('INVOICE_NO_CURRENT', -1),
        ], 200);
    }
}
