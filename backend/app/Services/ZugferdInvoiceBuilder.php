<?php

namespace App\Services;

use App\Exceptions\InvoiceDataException;
use App\Models\Company;
use App\Models\Document;
use App\Models\Invoice;
use App\Models\Param;
use App\Models\Project;
use horstoeko\zugferd\codelists\ZugferdInvoiceType;
use horstoeko\zugferd\ZugferdDocumentBuilder;
use horstoeko\zugferd\ZugferdDocumentPdfMerger;
use horstoeko\zugferd\ZugferdProfiles;
use Illuminate\Support\Collection;

class ZugferdInvoiceBuilder {
    private const TOTALS_TOLERANCE = 0.01;

    public static function build($pdf, $items, Company $company, $id = 0, string $documentTypeCode = ZugferdInvoiceType::INVOICE, ?Project $project = null): string {
        $params = $company->getParamsAttribute();
        $p      = Document::personalizationArray($company);

        $missingSenderData = array_diff(Company::senderReadiness(), ['email']);
        if ($missingSenderData) {
            throw new InvoiceDataException('Your company data is incomplete ('.implode(', ', $missingSenderData).'). Complete it on the dashboard under "Getting started" → "Your company".');
        }
        $me = Company::me();

        $buyerEmail = $company->invoiceRecipients()[0] ?? '';
        if ($buyerEmail === '') {
            throw new InvoiceDataException("Company {$company->id} has no e-mail address; XRechnung requires the buyer electronic address (BT-49).");
        }

        $sellerEmail = trim(Param::get('ME_EMAIL')->value ?? '');
        if ($sellerEmail === '') {
            $sellerEmail = trim((string)config('mail.from.address'));
        }
        if ($sellerEmail === '') {
            throw new InvoiceDataException('Neither Param ME_EMAIL nor mail.from.address is set; XRechnung requires the seller electronic address (BT-58).');
        }

        $sellerName   = Company::myName();
        $vatCategory  = $company->vatCategory($me);
        $vatExemption = match ($vatCategory) {
            'AE'    => [__('pdf.vat_reverse_charge', [], 'de'), 'VATEX-EU-AE'],
            'O'     => [__('pdf.vat_not_taxable', [], 'de'), 'VATEX-EU-O'],
            default => null,
        };

        $billable   = self::billableItems($items);
        $totalGross = round($billable->sum('gross'), 2);
        $totalNet   = round($billable->sum('net'), 2);

        $document = ZugferdDocumentBuilder::CreateNew(ZugferdProfiles::PROFILE_XRECHNUNG_3);

        $iban = Param::get('ME_IBAN')->value;

        $document
            ->setDocumentInformation($id, $documentTypeCode, new \DateTime, 'EUR')
            ->setDocumentSupplyChainEvent(new \DateTime);

        $adr = Document::rfc6350toFacturX($me->vcard->getFirstAttr('ADR'));
        $document
            ->setDocumentSeller($sellerName, Param::get('ME_TAX_ID')->value)
            ->addDocumentSellerGlobalId(Param::get('ME_SWIFT')->value, '0021')
            ->addDocumentSellerTaxRegistration('FC', Param::get('ME_TAX_ID')->value);

        if ($vatCategory !== 'O') {
            $document->addDocumentSellerTaxRegistration('VA', Param::get('ME_VAT_ID')->value);
        }

        $document
            ->setDocumentSellerAddress(...$adr)
            ->setDocumentSellerContact(
                Param::get('ME_COMPANY_OWNERS')->value,
                Param::get('ME_DEPARTMENT')->value,
                Param::get('ME_PHONE')->value,
                Param::get('ME_FAX')->value,
                $sellerEmail)
            ->setDocumentSellerCommunication('EM', $sellerEmail);

        $adr = Document::rfc6350toFacturX($p['address_array']);
        $document
            ->setDocumentBuyer($p['companyName'], $p['customerNumber'])
            ->setDocumentBuyerReference($p['customerNumber'])
            ->setDocumentBuyerAddress(...$adr)
            ->setDocumentBuyerContact('', '', '', '', $buyerEmail)
            ->setDocumentBuyerCommunication('EM', $buyerEmail);

        if ($vatCategory === 'AE') {
            $document->addDocumentBuyerTaxRegistration('VA', $company->vat_id);
        }

        $unitCodeMap = config('invoice.unit_codes');

        foreach ($billable as $k => $item) {
            $unitCode        = $unitCodeMap[$item['unit_name']] ?? 'C62';
            $grossPrice      = floatval($item['price']);
            $discountedPrice = floatval($item['price_discounted']);

            $netPrice = $grossPrice > $discountedPrice ? $discountedPrice : $grossPrice;

            $document->addNewPosition($k)
                ->setDocumentPositionProductDetails(strip_tags($item['text']), '', $item['product_id'])
                ->setDocumentPositionGrossPrice($grossPrice)
                ->setDocumentPositionNetPrice($netPrice)
                ->setDocumentPositionQuantity($item['qty'], $unitCode);

            $priceAllowance = round($grossPrice - $netPrice, 2);
            if ($priceAllowance > 0) {
                $document->addDocumentPositionGrossPriceAllowanceCharge($priceAllowance, false);
            }

            $document->addDocumentPositionTax($vatCategory, 'VAT', self::lineVatRate($vatCategory, floatval($item['vat_rate'])));

            $document->setDocumentPositionLineSummation(floatval($item['net']));
        }

        $calculatedVatTotal = 0.0;

        if ($vatExemption) {
            $document->addDocumentTax($vatCategory, 'VAT', $totalNet, 0.0, 0.0, ...$vatExemption);
        } else {
            foreach (self::vatBreakdownFromItems($billable) as $breakdown) {
                $calculatedVatTotal += $breakdown['tax_amount'];
                $document->addDocumentTax($breakdown['category'], 'VAT', $breakdown['taxable_amount'], $breakdown['tax_amount'], $breakdown['rate']);
            }
        }

        $calculatedVatTotal = round($calculatedVatTotal, 2);

        self::assertTotalsAddUp($totalNet, $calculatedVatTotal, $totalGross);

        $paymentDurationParam = $company->param('INVOICE_PAYMENT_DURATION', true);
        $paymentDuration      = $paymentDurationParam->value;
        $due_date             = now()->addDays($paymentDuration);

        if ($mandate = $company->directDebitMandate()) {
            $creditorId = trim(Param::get('ME_CREDITOR_ID')->value ?? '');
            if ($creditorId === '') {
                throw new InvoiceDataException("Company {$company->id} has a direct debit mandate, but Param ME_CREDITOR_ID is empty.");
            }
            $document->addDocumentPaymentMeanToDirectDebit($mandate['iban'], $creditorId);
            $document->addDocumentPaymentTerm(null, $due_date->toDateTime(), $mandate['reference']);
        } else {
            $document->addDocumentPaymentMeanToCreditTransfer(
                $iban, $sellerName, null,
                Param::get('ME_BIC')->value, (string)$id
            );
            $document->addDocumentPaymentTerm(null, $due_date->toDateTime());
        }

        if ($project && $project->po_number) {
            $document->setDocumentProcuringProject($project->po_number, $project->name);
        }

        $document->setDocumentSummation($totalGross, $totalGross, $totalNet, 0.0, 0.0, $totalNet, $calculatedVatTotal, null, 0.0);

        return (new ZugferdDocumentPdfMerger($document->getContent(), $pdf))->generateDocument()->downloadString('');
    }
    private static function lineVatRate(string $vatCategory, float $rate): ?float {
        return match ($vatCategory) {
            'O'     => null,
            'AE'    => 0.0,
            default => $rate,
        };
    }
    private static function billableItems($items): Collection {
        return collect($items)
            ->filter(fn ($item) => in_array($item->type, Invoice::ITEMS_ADDING_TO_INVOICE))
            ->values();
    }
    private static function vatBreakdownFromItems($items): array {
        $breakdown = [];

        foreach ($items as $item) {
            $rate    = floatval($item['vat_rate']);
            $rateKey = (string)$rate;

            if (! isset($breakdown[$rateKey])) {
                $breakdown[$rateKey] = ['rate' => $rate, 'taxable_amount' => 0.0, 'tax_amount' => 0.0, 'category' => 'S'];
            }

            $breakdown[$rateKey]['taxable_amount'] += floatval($item['net']);
            $breakdown[$rateKey]['tax_amount'] += floatval($item['vat']);
        }

        return array_values($breakdown);
    }
    private static function assertTotalsAddUp(float $net, float $vat, float $gross): void {
        if (abs($net + $vat - $gross) > self::TOTALS_TOLERANCE) {
            throw new InvoiceDataException(sprintf(
                'Invoice totals violate EN 16931 BR-CO-15: net %.2f plus VAT %.2f is %.2f, but gross is %.2f.',
                $net, $vat, $net + $vat, $gross
            ));
        }
    }
}
