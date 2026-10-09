<?php

namespace App\Actions;

use App\Models\Company;
use App\Models\File;
use App\Models\Invoice;
use App\Models\Param;
use App\Models\Project;
use App\Services\InvoiceItemEnhancementService;
use App\Services\InvoicePdfService;
use horstoeko\zugferd\codelists\ZugferdInvoiceType;

class CreateInvoiceAction {
    public function __construct(
        private InvoicePdfService $pdfService,
        private InvoiceItemEnhancementService $enhancementService
    ) {}

    public function execute(
        $items,
        string $title,
        string $prefix,
        string $suffix,
        Company $company,
        string $documentType = ZugferdInvoiceType::INVOICE,
        ?Invoice $invoice = null,
        ?Project $project = null
    ): array {
        [$zugferdPdf, $filename, $invoiceNumber] = $this->pdfService->generateInvoicePdf(
            $items,
            $title,
            $prefix,
            $suffix,
            $company,
            $documentType,
            $invoice,
            $project
        );

        Param::incrementNumber('INVOICE_NO_CURRENT');

        $invoice = $this->createInvoiceRecord($invoiceNumber, $company, $project, $filename);
        File::saveTo('invoices/'.$filename, $zugferdPdf, $invoice, 'invoices.values');
        return [$invoice, $zugferdPdf, $filename];
    }
    private function createInvoiceRecord(
        string $invoiceNumber,
        Company $company,
        ?Project $project,
        string $filename
    ): Invoice {
        $paymentDuration   = $this->getPaymentDuration($project, $company);
        $overdraftInterest = Param::get('INVOICE_OVERDRAFT_INTEREST')->value;

        $invoice = Invoice::create([
            'due_at'           => now()->add('days', $paymentDuration),
            'remind_at'        => now()->add('days', $paymentDuration),
            'default_interest' => $overdraftInterest,
            'name'             => $invoiceNumber,
            'company_id'       => $company->id,
            'file_dir'         => 'invoices/'.$filename,
        ]);

        $invoice->save();
        return $invoice;
    }
    private function getPaymentDuration(?Project $project, Company $company): int {
        // Cascade: project -> customer -> global default
        if ($project && $projectDuration = $project->param('INVOICE_PAYMENT_DURATION')?->value) {
            return (int)$projectDuration;
        }
        if ($customerDuration = $company->param('INVOICE_PAYMENT_DURATION')?->value) {
            return (int)$customerDuration;
        }
        return (int)(Param::get('INVOICE_PAYMENT_DURATION')->value ?? '14');
    }
}
