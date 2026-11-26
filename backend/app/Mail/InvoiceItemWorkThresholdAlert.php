<?php

namespace App\Mail;

use App\Models\InvoiceItem;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class InvoiceItemWorkThresholdAlert extends Mailable {
    use Queueable, SerializesModels;

    public function __construct(
        public InvoiceItem $item,
        public int $threshold,
        public float $ratio
    ) {}

    public function envelope(): Envelope {
        return new Envelope(
            subject: "Feature Budget Alert: {$this->item->text} reached {$this->threshold}% ({$this->item->project->name})"
        );
    }
    public function content(): Content {
        return new Content(
            view: 'mail.invoice-item-work-threshold-alert',
            with: [
                'item'      => $this->item,
                'project'   => $this->item->project,
                'threshold' => $this->threshold,
                'percent'   => round($this->ratio * 100, 1),
            ],
        );
    }
}
