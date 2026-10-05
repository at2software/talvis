<?php

namespace App\Http\Controllers;

use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;

class PdfTemplateController extends Controller {
    private const FILES = [
        'html' => 'pdf/template.html',
        'css'  => 'pdf/styles.css',
    ];
    private const LOGO = 'pdf/at2_logo.png';

    public function show() {
        return [
            'html'        => $this->read(self::FILES['html']),
            'css'         => $this->read(self::FILES['css']),
            'baseUrl'     => rtrim(asset('/'), '/').'/',
            'pdfBase'     => rtrim(asset('pdf'), '/').'/',
            'logoUrl'     => asset(self::LOGO).'?t='.@filemtime(public_path(self::LOGO)),
            'hasOriginal' => file_exists(public_path(self::FILES['html'].'.original')),
        ];
    }
    public function update(Request $r) {
        $data = $r->validate([
            'html' => 'required|string',
            'css'  => 'required|string',
        ]);

        foreach (self::FILES as $key => $rel) {
            $this->snapshotOriginal($rel);
            file_put_contents(public_path($rel), $data[$key]);
        }
        return ['success' => true];
    }
    public function revert() {
        foreach ([...array_values(self::FILES), self::LOGO] as $rel) {
            $orig = public_path($rel.'.original');
            if (file_exists($orig)) {
                copy($orig, public_path($rel));
            }
        }
        return $this->show() + ['reverted' => true];
    }
    public function uploadLogo(Request $r) {
        $r->validate(['logo' => 'required|image']);
        $this->snapshotOriginal(self::LOGO);
        $r->file('logo')->move(public_path('pdf'), 'at2_logo.png');
        return ['success' => true, 'logoUrl' => asset(self::LOGO).'?t='.time()];
    }
    public function preview(Request $r) {
        $html = $r->input('html') ?: $this->read(self::FILES['html']);
        $css  = $r->input('css', '');

        if ($css !== '') {
            $html = str_ireplace('</head>', "<style>\n{$css}\n</style>\n</head>", $html);
        }
        $html = strtr($html, $this->dummyTokens());

        $pdf = Pdf::loadHTML($html);
        return ['pdf' => base64_encode($pdf->output())];
    }
    private function read(string $rel): string {
        $path = public_path($rel);
        return file_exists($path) ? file_get_contents($path) : '';
    }
    private function snapshotOriginal(string $rel): void {
        $path = public_path($rel);
        $orig = $path.'.original';
        if (! file_exists($orig) && file_exists($path)) {
            copy($path, $orig);
        }
    }
    private function dummyTokens(): array {
        $row = fn ($k, $v) => '<div style="display:block;width:100%;"><div style="float:right;display:inline-block;">'.$v.'</div>'
            .'<div style="display:inline-block;font-weight:bold;">'.$k.'</div></div>';

        $content = '<p>Sehr geehrte Damen und Herren,</p>'
            .'<p>vielen Dank für Ihr Vertrauen. Nachfolgend stellen wir Ihnen die vereinbarten Leistungen in Rechnung.</p>'
            .'<table class="content-table"><thead><tr><th class="text-start">Position</th><th class="text-end">Menge</th>'
            .'<th class="text-end">Einzelpreis</th><th class="text-end">Gesamt</th></tr></thead><tbody>'
            .'<tr><td>Beratung &amp; Konzeption</td><td class="text-end">8,00 h</td><td class="text-end">120,00 €</td><td class="text-end">960,00 €</td></tr>'
            .'<tr><td>Entwicklung</td><td class="text-end">24,00 h</td><td class="text-end">120,00 €</td><td class="text-end">2.880,00 €</td></tr>'
            .'</tbody><tfoot><tr class="net-row"><td colspan="3" class="text-end">Netto</td><td class="text-end">3.840,00 €</td></tr>'
            .'<tr><td colspan="3" class="text-end">zzgl. 19% USt.</td><td class="text-end">729,60 €</td></tr>'
            .'<tr class="gross-row"><td colspan="3" class="text-end">Gesamtbetrag</td><td class="text-end">4.569,60 €</td></tr></tfoot></table>'
            .'<p>Bitte überweisen Sie den Betrag innerhalb von 14 Tagen.</p>';

        return [
            '[documentTitle]' => 'Rechnung 2026-0042',
            '[address]'       => 'Musterfirma GmbH<br>Herr Max Mustermann<br>Musterstraße 1<br>12345 Musterstadt',
            '[headerInfo]'    => $row('Kundennummer', '10042').'<br>'.$row('Ansprechpartner', 'Erika Beispiel')
                .'<br>'.$row('Telefon', '+49 (0)123 456789'),
            '[dayNow]'        => date('d.m.Y'),
            '[pageLabel]'     => 'Seite',
            '[content]'       => $content,
        ];
    }
}
