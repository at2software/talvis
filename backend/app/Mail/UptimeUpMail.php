<?php

namespace App\Mail;

use App\Models\UptimeCheck;
use App\Models\UptimeMonitor;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class UptimeUpMail extends Mailable {
    use Queueable, SerializesModels;

    public function __construct(
        private UptimeMonitor $monitor,
        private UptimeCheck $check
    ) {}

    public function envelope(): Envelope {
        return new Envelope(
            subject: "[TALVIS] Uptime Recovery: {$this->monitor->name} is back online",
        );
    }
    public function content(): Content {
        return new Content(
            view: 'mail.uptime-up',
            with: [
                'monitor' => $this->monitor,
                'check'   => $this->check,
            ],
        );
    }
}
