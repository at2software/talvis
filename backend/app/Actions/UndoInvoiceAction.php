<?php

namespace App\Actions;

use App\Models\Invoice;
use App\Models\Param;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;

class UndoInvoiceAction {
    public function execute(Invoice $invoice): Response|JsonResponse {
        $currentInvoiceNo = Param::get('INVOICE_NO_CURRENT')->value;
        $invoiceNumber    = Invoice::getCurrentInvoiceNumber(-1)['value'];

        if ($invoice->name !== $invoiceNumber) {
            return response('Can only undo the latest invoice', 403);
        }

        $firstItem = $invoice->invoiceItems()->first();
        $invoice->releaseItems();
        $invoice->delete();

        $invoiceNoParam        = Param::get('INVOICE_NO_CURRENT');
        $invoiceNoParam->value = $currentInvoiceNo - 1;
        $invoiceNoParam->save();
        return response([
            'status'             => 'Successfully undone',
            'item'               => $firstItem ?? null,
            'INVOICE_NO_CURRENT' => $invoiceNoParam->value,
        ], 200);
    }
}
