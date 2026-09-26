<?php

namespace App\Mail;

use App\Models\UptimeCheck;
use App\Models\UptimeMonitor;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class UptimeDownMail extends Mailable {
    use Queueable, SerializesModels;

    public function __construct(
        private UptimeMonitor $monitor,
        private UptimeCheck $check
    ) {}

    public function envelope(): Envelope {
        return new Envelope(
            subject: "[TALVIS] Uptime Alert: {$this->monitor->name} is down",
        );
    }
    public function content(): Content {
        return new Content(
            view: 'mail.uptime-down',
            with: [
                'monitor' => $this->monitor,
                'check'   => $this->check,
            ],
        );
    }
}
