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

        $me = Company::me();
        if (! $me) {
            throw new InvoiceDataException('Param ME_ID does not resolve to a company; the invoice sender is not configured.');
        }

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

        $sellerName = Company::myName();
        if ($sellerName === '') {
            throw new InvoiceDataException('Neither Param ME_NAME nor the company behind Param ME_ID has a name; XRechnung requires the seller name (BT-27).');
        }

        $sellerCountry = trim((string)$me->vcard?->getCountryCode());
        if ($sellerCountry === '') {
            throw new InvoiceDataException('The company behind Param ME_ID has no country in its vCard address; the seller country decides whether a sale is domestic or intra-community.');
        }

        $isReverseCharge = self::isReverseCharge(
            $sellerCountry,
            trim((string)$company->vcard?->getCountryCode()),
            (bool)$company->needs_vat_handling,
            $company->vat_id
        );

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

        if (! $isReverseCharge) {
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

        if ($isReverseCharge) {
            $document->addDocumentBuyerTaxRegistration('VA', $company->vat_id);
        }

        $unitCodeMap = config('invoice.unit_codes');

        foreach ($billable as $k => $item) {
            $unitCode        = $unitCodeMap[$item['unit_name']] ?? 'C62';
            $grossPrice      = floatval($item['price']);
            $discountedPrice = floatval($item['price_discounted']);

            $netPrice = $grossPrice > $discountedPrice ? $discountedPrice : $grossPrice;

            $vatRate     = floatval($item['vat_rate']);
            $vatCategory = 'S';

            if (! $company->needs_vat_handling) {
                $vatCategory = 'G';
                $vatRate     = 0.0;
            } elseif ($isReverseCharge) {
                $vatCategory = 'O';
                $vatRate     = 0.0;
            }

            $document->addNewPosition($k)
                ->setDocumentPositionProductDetails(strip_tags($item['text']), '', $item['product_id'])
                ->setDocumentPositionGrossPrice($grossPrice)
                ->setDocumentPositionNetPrice($netPrice)
                ->setDocumentPositionQuantity($item['qty'], $unitCode);

            $priceAllowance = round($grossPrice - $netPrice, 2);
            if ($priceAllowance > 0) {
                $document->addDocumentPositionGrossPriceAllowanceCharge($priceAllowance, false);
            }

            if ($vatCategory === 'O') {
                $document->addDocumentPositionTax($vatCategory, 'VAT', null, null, 'Steuerfrei nach §4 Nummer 1b in Verbindung mit §6a UStG');
            } elseif ($vatCategory === 'G') {
                $document->addDocumentPositionTax($vatCategory, 'VAT', $vatRate, null, 'Steuerfreie Ausfuhrlieferung gemäß §4 Nr. 1a UStG i.V.m. §6 UStG');
            } else {
                $document->addDocumentPositionTax($vatCategory, 'VAT', $vatRate);
            }

            $document->setDocumentPositionLineSummation(floatval($item['net']));
        }

        $calculatedVatTotal = 0.0;

        if (! $company->needs_vat_handling) {
            $document->addDocumentTax('G', 'VAT', $totalNet, 0.0, 0.0,
                'Steuerfreie Ausfuhrlieferung gemäß §4 Nr. 1a UStG i.V.m. §6 UStG', null);
        } elseif ($isReverseCharge) {
            $document->addDocumentTax('O', 'VAT', $totalNet, 0.0, 0.0,
                'Steuerfrei nach §4 Nummer 1b in Verbindung mit §6a UStG');
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

        $hasDirectDebitMandate = ! empty($params['INVOICE_DD_MANDATE']) &&
                                ! empty($params['INVOICE_DD_IBAN']) &&
                                trim($params['INVOICE_DD_MANDATE']) !== '' &&
                                trim($params['INVOICE_DD_IBAN']) !== '';

        if ($hasDirectDebitMandate) {
            $debitedAccount = trim($params['INVOICE_DD_IBAN']);
            $creditorId     = trim(Param::get('ME_CREDITOR_ID')->value ?? '');
            if ($creditorId === '') {
                throw new InvoiceDataException("Company {$company->id} has a direct debit mandate, but Param ME_CREDITOR_ID is empty.");
            }
            $document->addDocumentPaymentMeanToDirectDebit($debitedAccount, $creditorId);
            $document->addDocumentPaymentTerm(null, $due_date->toDateTime(), trim($params['INVOICE_DD_MANDATE']));
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

    private static function isReverseCharge(string $sellerCountry, string $buyerCountry, bool $buyerInEu, ?string $buyerVatId): bool {
        if (! $buyerInEu || trim((string)$buyerVatId) === '') {
            return false;
        }

        if ($buyerCountry === '' || $buyerCountry === $sellerCountry) {
            return false;
        }

        return true;
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
