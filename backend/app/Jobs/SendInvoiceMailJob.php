<?php

namespace App\Jobs;

use App\Helpers\NLog;
use App\Mail\InvoiceMail;
use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class SendInvoiceMailJob implements ShouldQueue {
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        private Invoice $invoice
    ) {}

    public function handle(): void {
        $recipients = $this->invoice->company->invoiceRecipients();
        if (empty($recipients)) {
            NLog::warning('No valid invoice mail recipient', ['invoice_id' => $this->invoice->id, 'invoice_email' => $this->invoice->company->invoice_email]);
            return;
        }
        Mail::to($recipients)->send(new InvoiceMail($this->invoice));
    }
}
