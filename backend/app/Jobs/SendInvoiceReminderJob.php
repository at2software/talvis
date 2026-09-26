<?php

namespace App\Jobs;

use App\Helpers\NLog;
use App\Mail\InvoiceReminderMail;
use App\Models\Invoice;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Mail;

class SendInvoiceReminderJob implements ShouldQueue {
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
            NLog::warning('No valid invoice reminder recipient', ['invoice_id' => $this->invoice->id, 'invoice_email' => $this->invoice->company->invoice_email]);
            return;
        }
        Mail::to($recipients)->send(new InvoiceReminderMail($this->invoice));

        // remind_at is now set in Invoice::sendReminder() before the job is dispatched
        // This ensures the frontend gets immediate feedback
    }
}
