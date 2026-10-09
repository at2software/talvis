<?php

namespace App\Actions;

use App\Enums\WebhookEvent;
use App\Models\Invoice;
use App\Models\Param;
use App\Models\WebhookEndpoint;
use horstoeko\zugferd\codelists\ZugferdInvoiceType;

class CancelInvoiceAction {
    public function __construct(
        private CreateInvoiceAction $createInvoiceAction,
        private UpdateInvoiceStatisticsAction $updateStatisticsAction
    ) {}

    public function execute(Invoice $invoice): array {
        $lang      = $invoice->company->getLanguage();
        $formality = $invoice->company->getFormality();

        $title = Param::get('INVOICE_CANCEL_TITLE')->localizedValue($lang, $formality) ?? '';

        $items = $invoice->invoiceItems;
        $items->each(function (&$_) {
            $_->qty   = -$_->qty;
            $_->net   = -$_->net;
            $_->total = -$_->total;
            $_->gross = -$_->gross;
            $_->vat   = -$_->vat;
        });

        [$cancellationInvoice, $zugferdPdf, $filename] = $this->createInvoiceAction->execute(
            $items,
            $title,
            Param::get('INVOICE_CANCEL_PREFIX')->localizedValue($lang, $formality) ?? '',
            Param::get('INVOICE_CANCEL_SUFFIX')->localizedValue($lang, $formality) ?? '',
            $invoice->company,
            ZugferdInvoiceType::CORRECTION,
            $invoice
        );

        $invoice->releaseItems();

        $invoice->setCancelledAttributes();
        $cancellationInvoice->cancellation_invoice_id = $invoice->id;
        $cancellationInvoice->setCancelledAttributes();

        $this->updateStatisticsAction->execute($invoice->company);
        $this->updateStatisticsAction->execute();
        WebhookEndpoint::dispatch(WebhookEvent::InvoiceCancelled, [
            'invoice'      => $invoice->fresh()->toWebhookPayload(),
            'cancellation' => $cancellationInvoice->fresh()->toWebhookPayload(),
        ]);
        return [$zugferdPdf, $filename];
    }
}
