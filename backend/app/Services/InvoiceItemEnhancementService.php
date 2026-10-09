<?php

namespace App\Services;

use App\Enums\InvoiceVatHandling;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Param;
use Illuminate\Support\Collection;

class InvoiceItemEnhancementService {
    private string $lang = 'de';
    private string $kNET;
    private string $kGROSS;

    public function enhanceItemsForPdf(Collection $items, Company $company): array {
        $this->lang   = $company->getLanguage();
        $this->kNET   = __('pdf.net_value', [], $this->lang);
        $this->kGROSS = __('pdf.gross_value', [], $this->lang);

        $pos       = 0;
        $all       = 0;
        $discounts = [];
        $footers   = [$this->kNET => 0, $this->kGROSS => 0];

        foreach ($items as &$item) {
            $this->enhanceItemForDisplay($item, $pos, $footers, $discounts, $company);

            if (in_array($item->type, Invoice::ITEMS_ADDING_TO_PROJECT)) {
                $all += $item->net;
            }
        }

        $formattedFooters   = $this->buildFooters($footers);
        $formattedDiscounts = $this->buildDiscounts($discounts);
        return [$items, $formattedFooters, $all, $formattedDiscounts, $this->lang];
    }
    private function enhanceItemForDisplay(&$item, &$pos, &$footers, &$discounts, Company $company): void {
        $item->text   = nl2br($item->text);
        $item->eprice = Invoice::format($item->price_discounted);
        $item->etotal = Invoice::format($item->total);
        $item->eqty   = Invoice::formatQty($item->qty);

        if (in_array($item->type, Invoice::ITEMS_NEED_INFO)) {
            $pos++;
            $item->sPosition = $pos;
        } else {
            $item->sPosition = '';
        }

        if (! in_array($item->type, Invoice::ITEMS_NEED_INFO)) {
            return;
        }

        $handling                                         = $this->buildVatHandlingText($item, $company);
        isset($footers[$handling]) || $footers[$handling] = 0;

        $handlingIndex   = array_search($handling, array_keys($footers)) - 1;
        $item->ehandling = Invoice::circledNumber($handlingIndex);
        $item->ediscount = ($item->price - $item->price_discounted) * $item->qty;

        if (in_array($item->type, Invoice::ITEMS_ADDING_TO_INVOICE)) {
            $footers[$this->kNET] += $item->net;
            $footers[$this->kGROSS] += $item->gross;
            $footers[$handling] += $item->vat;
        }

        if ($item->discount > 0) {
            $discount                                             = __('pdf.including_discount', ['percent' => $item->discount], $this->lang);
            isset($discounts[$discount]) || $discounts[$discount] = 0;
            $discounts[$discount] += $item->ediscount;

            $discountIndex = chr(65 + array_search($discount, array_keys($discounts)));
            $item->ehandling .= $discountIndex;
        }
    }
    private function buildVatHandlingText($item, Company $company): string {
        $handling = 'ERROR: Vat reason could not be computed!';

        switch ($item->vat_calculation) {
            case InvoiceVatHandling::Net:
                $handling = __('pdf.vat_on_net', ['rate' => $item->vat_rate], $this->lang);
                break;
            case InvoiceVatHandling::Gross:
                $handling = __('pdf.vat_in_gross', ['rate' => $item->vat_rate], $this->lang);
                break;
        }

        if ($item->vat_rate == 0) {
            if ($company->needs_vat_handling) {
                $handling = __('pdf.vat_exempt_eu', [], $this->lang).'<br>';
                $handling .= __('pdf.our_vat_id', [], $this->lang).' '.Param::get('ME_VAT_ID')->value.'<br>';
                $handling .= __('pdf.your_vat_id', [], $this->lang).' '.$company->vat_id;
            } else {
                $handling = __('pdf.vat_exempt_export', [], $this->lang).'<br>';
            }
        }
        return $handling;
    }
    private function buildFooters(array $footers): array {
        $_footers = [];

        foreach ($footers as $k => $v) {
            $index  = array_search($k, array_keys($footers)) - 1;
            $symbol = $index > 0 ? Invoice::circledNumber($index) : '';

            $vatData = null;
            if (! in_array($k, [$this->kNET, $this->kGROSS])) {
                $vatRate = 0;
                if (preg_match('/(\d+(?:\.\d+)?)%/', $k, $matches)) {
                    $vatRate = floatval($matches[1]);
                }

                $vatAmount     = floatval($v);
                $taxableAmount = $vatRate > 0 ? ($vatAmount / $vatRate * 100) : 0;

                if ($vatAmount > 0) {
                    $vatData = [
                        'category'       => 'S',
                        'rate'           => $vatRate,
                        'taxable_amount' => $taxableAmount,
                        'tax_amount'     => $vatAmount,
                    ];
                }
            }

            $_footers[] = [$k, Invoice::format($v), $symbol, $vatData];
        }

        $netEntry = $_footers[1];
        unset($_footers[1]);
        $_footers[] = $netEntry;
        return $_footers;
    }
    private function buildDiscounts(array $discounts): array {
        $_discounts = [];

        foreach ($discounts as $k => $v) {
            $index        = chr(65 + array_search($k, array_keys($discounts)));
            $_discounts[] = [$k, Invoice::format($v), $index];
        }
        return $_discounts;
    }
}
