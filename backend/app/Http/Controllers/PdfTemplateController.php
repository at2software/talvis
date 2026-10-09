<?php

namespace App\Http\Controllers;

use App\Enums\InvoiceItemType;
use App\Models\Document;
use App\Models\Invoice;
use App\Support\Letterhead;
use Illuminate\Http\Request;

class PdfTemplateController extends Controller {
    private const SAMPLE_LANG = 'de';

    public function show() {
        return [
            'html'           => Letterhead::html(),
            'css'            => Letterhead::css(),
            'baseUrl'        => rtrim(asset('/'), '/').'/',
            'pdfBase'        => rtrim(asset('pdf'), '/').'/',
            'logoUrl'        => Letterhead::logoDataUri(),
            'logoSources'    => Letterhead::LOGO_SOURCES,
            'hasCustomLogo'  => Letterhead::customLogo() !== null,
            'customized'     => Letterhead::isCustomized(),
            'senderTokens'   => Letterhead::SENDER_TOKENS,
            'documentTokens' => Letterhead::DOCUMENT_TOKENS,
            'tokens'         => Letterhead::tokens(self::SAMPLE_LANG) + $this->sampleTokens() + ['pageCount' => '1'],
        ];
    }
    public function update(Request $r) {
        $data = $r->validate([
            'html' => 'required|string',
            'css'  => 'present|nullable|string',
        ]);
        Letterhead::save($data['html'], $data['css'] ?? '');
        return ['success' => true];
    }
    public function revert() {
        Letterhead::reset();
        return $this->show();
    }
    public function uploadLogo(Request $r) {
        $r->validate(['logo' => 'required|image|mimes:png,jpg,jpeg,gif']);
        Letterhead::storeLogo($r->file('logo'));
        return ['logoUrl' => Letterhead::logoDataUri(), 'hasCustomLogo' => true];
    }
    public function destroyLogo() {
        Letterhead::removeLogo();
        return ['logoUrl' => Letterhead::logoDataUri(), 'hasCustomLogo' => false];
    }
    public function preview(Request $r) {
        $sample   = $this->sampleTokens();
        $template = Document::getPdfTemplate($sample['documentTitle'], lang: self::SAMPLE_LANG, html: $r->input('html') ?: null, css: $r->input('css'));
        $template = strtr($template, Letterhead::bracketed($sample));
        return ['pdf' => base64_encode(Document::renderPdf($template))];
    }
    private function sampleTokens(): array {
        $label = fn (string $key) => __('pdf.'.$key, [], self::SAMPLE_LANG);
        $title = __('pdf.draft_invoice', [], self::SAMPLE_LANG);
        return [
            'documentTitle' => $title,
            'footerContext' => $title,
            'address'       => 'Musterfirma GmbH<br>Herr Max Mustermann<br>Musterstraße 1<br>12345 Musterstadt',
            'headerInfo'    => Document::pdfBlockRow($label('contact_person'), 'Erika Beispiel')
                .Document::pdfBlockRow($label('phone'), '+49 (0)123 456789')
                .'<br>'.Document::pdfBlockRow($label('customer_number'), '10042'),
            'dayNow'      => date('d.m.Y'),
            'pageLabel'   => $label('page'),
            'pageOfLabel' => $label('page_of'),
            'content'     => $this->sampleContent($label),
        ];
    }
    private function sampleContent(callable $label): string {
        $item = fn (int $pos, string $text, string $price, string $qty, string $total) => (object)[
            'type' => InvoiceItemType::from(0), 'sPosition' => $pos, 'text' => $text, 'eprice' => $price,
            'eqty' => $qty, 'unit_name' => 'h', 'ehandling' => '', 'etotal' => $total,
        ];
        $items = [
            $item(1, 'Beratung &amp; Konzeption', '120,00 EUR', '8', '960,00 EUR'),
            $item(2, 'Entwicklung', '120,00 EUR', '24', '2.880,00 EUR'),
        ];
        $footers = [
            [$label('net_value'), '3.840,00 EUR', ''],
            [__('pdf.vat_on_net', ['rate' => 19], self::SAMPLE_LANG), '729,60 EUR', ''],
            [$label('gross_value'), '4.569,60 EUR', ''],
        ];
        return '<p>Sehr geehrte Damen und Herren,</p><p>vielen Dank für Ihren Auftrag. Wir berechnen Ihnen folgende Leistungen:</p>'
            .Invoice::getInvoiceBlade($items, $footers, [], self::SAMPLE_LANG)
            .'<p>Bitte überweisen Sie den Betrag innerhalb von 14 Tagen.</p>';
    }
}
