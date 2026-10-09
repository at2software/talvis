<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;

class InvoiceReminder extends BaseModel {
    use HasFactory;
    use SoftDeletes;

    const REMINDER_PAYMENT_DURATION = 14;

    protected $appends  = ['class', 'icon', 'path'];
    protected $fillable = ['stage', 'fee', 'file_dir', 'invoice_id'];

    public function invoice() {
        return $this->belongsTo(Invoice::class);
    }
    public static function MakeFileName(Invoice $invoice, $reminderCount = null) {
        if ($reminderCount === null) {
            $reminderCount = $invoice->reminderCount + 1;
        }
        return $reminderCount.'. Mahnung zu '.$invoice->name;
    }
    public static function createForInvoice(Invoice $invoice) {
        $f = fn ($_): string => number_format($_, 2, ',', '.').' €';

        $INVOICE_OVERDRAFT_INTEREST = Param::get('INVOICE_OVERDRAFT_INTEREST')->value;
        $INVOICE_REMINDER_FEE       = Param::get('INVOICE_REMINDER_FEE')->value;
        $OVERDUE_DAYS               = floor(max(0, $invoice->due_at->diffInDays(now(), false)));
        $OVERDUE_INTEREST           = $INVOICE_OVERDRAFT_INTEREST * $OVERDUE_DAYS / 36000;
        $overdueInterest            = $OVERDUE_INTEREST * $invoice->gross;

        $reminderCount = $invoice->reminderCount + 1;
        $pre           = $reminderCount === 1 ? 'INVOICE_M1_' : 'INVOICE_M2_';

        $name     = $title = self::MakeFileName($invoice, $reminderCount);
        $filename = 'invoices/'.File::filename_safe($name.'.pdf');

        $reminder = InvoiceReminder::create([
            'stage'      => $reminderCount,
            'fee'        => $INVOICE_REMINDER_FEE,
            'invoice_id' => $invoice->id,
            'file_dir'   => $filename,
        ]);

        $lang      = $invoice->company->getLanguage();
        $formality = $invoice->company->getFormality();

        $reminderFees = 0;
        foreach ($invoice->reminders as $existingReminder) {
            $reminderFees += $existingReminder->fee;
        }
        $total = $invoice->gross + $reminderFees + $overdueInterest;

        $rows = '';
        $rows .= '<tr><td class="label">'.$invoice->name.'</td><td class="amount">'.$f($invoice->gross).'</td></tr>';
        foreach ($invoice->reminders as $existingReminder) {
            $rows .= '<tr><td class="label">'.$existingReminder->stage.'. Mahnung – Mahngebühren</td><td class="amount">'.$f($existingReminder->fee).'</td></tr>';
        }
        $rows .= '<tr><td class="label">'.$INVOICE_OVERDRAFT_INTEREST.'% Überziehungszinsen für '.$OVERDUE_DAYS.' Tage</td><td class="amount">'.$f($overdueInterest).'</td></tr>';
        $rows .= '<tr class="total-row"><td class="label"><strong>Gesamtforderung</strong></td><td class="amount"><strong>'.$f($total).'</strong></td></tr>';

        $content = '';
        $content .= $invoice->company->param($pre.'PREFIX', true)->localizedValue($lang, $formality);
        $content .= '
<style>
.reminder-table { font-size: 9pt; width: 100%; border-collapse: collapse; margin: 8px 0; }
.reminder-table td { padding: 3px 6px; vertical-align: top; }
.reminder-table .label { text-align: left; }
.reminder-table .amount { text-align: right; white-space: nowrap; width: 140px; }
.reminder-table .total-row td { border-top: 1px solid #000; padding-top: 5px; }
</style>
<table class="reminder-table"><tbody>'.$rows.'</tbody></table>';
        $content .= $invoice->company->param($pre.'SUFFIX', true)->localizedValue($lang, $formality);

        $template = Document::getPdfTemplate($title, lang: $lang);
        $template = str_replace('[content]', $content, $template);
        $template = Document::personalized($template, $invoice->company);

        File::saveTo($filename, Document::renderPdf($template), $reminder, 'invoices.values');
        return $reminder;
    }
}
