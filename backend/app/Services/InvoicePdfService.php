<?php

namespace App\Services;

use App\Models\Company;
use App\Models\Document;
use App\Models\File;
use App\Models\Invoice;
use App\Models\Project;
use Barryvdh\DomPDF\Facade\Pdf;
use horstoeko\zugferd\codelists\ZugferdInvoiceType;

class InvoicePdfService {
    public function generateInvoicePdf(
        $items,
        string $title,
        string $prefix,
        string $suffix,
        Company $company,
        string $documentType = ZugferdInvoiceType::INVOICE,
        ?Invoice $invoice = null,
        ?Project $project = null,
        bool $draft = false
    ): array {
        $invoiceNumber                                     = Invoice::getCurrentInvoiceNumber()['value'];
        [$enhancedItems, $footer, $all, $discounts, $lang] = Invoice::enhancedItemsForPdf($items, $company);

        $content = $this->buildPdfContent(
            $enhancedItems,
            $footer,
            $discounts,
            $prefix,
            $suffix,
            $title,
            $invoiceNumber,
            $lang
        );

        $pdfTitle   = $draft ? __('pdf.draft_invoice', [], $lang) : $this->buildPdfTitle($title, $invoiceNumber);
        $zugferdPdf = $this->generatePdfWithZugferd(
            $content,
            $pdfTitle,
            $company,
            $invoice,
            $enhancedItems,
            $invoiceNumber,
            $documentType,
            $project,
            $draft
        );

        $filename = $draft
            ? __('pdf.draft_invoice', [], $lang).' '.date('Y-m-d').'.pdf'
            : Invoice::MakeFileName($invoiceNumber);
        $filename = File::filename_safe($filename);
        return [$zugferdPdf, $filename, $invoiceNumber];
    }
    private function buildPdfContent(
        $items,
        array $footer,
        array $discounts,
        string $prefix,
        string $suffix,
        string $title,
        string $invoiceNumber,
        string $lang = 'de'
    ): string {
        $grossAmount = $this->parseGrossAmount($footer, $lang);

        $content = ''; // view('SepaQR', ['qr' => Invoice::getSepaQr($grossAmount, $title.' '.$invoiceNumber)])->render();
        $content .= $prefix;
        $content .= Invoice::getInvoiceBlade($items, $footer, $discounts, $lang);
        $content .= $suffix;
        return $content;
    }
    private function buildPdfTitle(string $title, string $invoiceNumber): string {
        return $title.' '.$invoiceNumber;
    }
    private function parseGrossAmount(array $footer, string $lang = 'de'): float {
        $grossKey    = __('pdf.gross_value', [], $lang);
        $grossFooter = collect($footer)->firstWhere(0, $grossKey);
        if (! $grossFooter) {
            return 0;
        }

        $amount = str_replace([' EUR', '.'], ['', ''], $grossFooter[1]);
        $amount = str_replace(',', '.', $amount);
        return floatval($amount);
    }
    private function generatePdfWithZugferd(
        string $content,
        string $pdfTitle,
        Company $company,
        ?Invoice $invoice,
        $items,
        string $invoiceNumber,
        string $documentType,
        ?Project $project,
        bool $draft = false
    ): string {
        $headers = [];
        if ($project) {
            $headers[] = Document::pdfBlockRow(__('pdf.project', [], $company->getLanguage()), $project->name);
            if ($project->po_number) {
                $headers[] = Document::pdfBlockRow('', $project->po_number);
            }
        }

        $template = Document::getPdfTemplate($pdfTitle);
        $template = str_replace('[content]', $content, $template);
        $template = Document::personalized($template, $company, $headers, true, $project);

        if ($invoice) {
            $template = Document::replaceInvoiceInformation($template, $invoice);
        }

        $pdf       = Pdf::loadHTML($template);
        $pdfString = $pdf->stream()->getContent();

        if ($draft) {
            return $pdfString;
        }
        return Document::makeZUGFeRD($pdfString, $items, $company, $invoiceNumber, $documentType, $project);
    }
}
