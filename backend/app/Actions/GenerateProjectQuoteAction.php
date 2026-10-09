<?php

namespace App\Actions;

use App\Enums\InvoiceItemType;
use App\Models\Document;
use App\Models\File;
use App\Models\Invoice;
use App\Models\Project;
use App\Models\ProjectProjectState;
use Illuminate\Http\Response;

class GenerateProjectQuoteAction {
    public function execute(Project $project, bool $preview = false): Response {
        [$items, $footer, $all, $discounts, $lang] = Invoice::enhancedItemsForPdf(
            $project->indexedItems()->whereStage(0)->get(),
            $project->company
        );

        $title       = __($preview ? 'pdf.quote_preview' : 'pdf.quote', [], $lang);
        $quoteNumber = Project::getCurrentQuoteNumber();
        $validUntil  = date('d.m.Y', strtotime('+'.Document::getQuoteValidity($project).' days'));

        $template = Document::getPdfTemplate($title, footerContext: trim($title.' '.$quoteNumber), lang: $lang);
        $content  = $this->buildContent($project, $items, $footer, $discounts, $lang);
        $template = str_replace('[content]', $content, $template);
        $headers  = [
            Document::pdfBlockRow(__('pdf.project', [], $lang), $project->name)
            .Document::pdfBlockRow(__('pdf.quote_number', [], $lang), $quoteNumber)
            .Document::pdfBlockRow(__('pdf.valid_until', [], $lang), $validUntil),
        ];
        $template = Document::personalized($template, $project->addressee, $headers, project: $project);

        $data     = Document::renderPdf($template);
        $filename = $this->makeFileName($title, $project, $quoteNumber);
        if ($preview) {
            return File::streamPdf($data, utf8_decode($filename));
        }

        ProjectProjectState::create([
            'project_id'       => $project->id,
            'project_state_id' => 6,
        ]);
        Project::incrementQuoteNumber();
        File::saveTo('quotes/'.$filename, $data, $project, 'invoices.values');
        return File::streamPdf($data, utf8_decode($filename));
    }
    private function buildContent(Project $project, $items, $footer, $discounts, string $lang): string {
        $formality = $project->company->getFormality();

        $hasOptionalItems = $items->filter(fn ($item) => $item->type === InvoiceItemType::Optional)->isNotEmpty();
        $content          = '';
        $content .= $project->param('PROJECT_PREFIX', true)->localizedValue($lang, $formality);
        $content .= '<br>';
        foreach ($project->getQuoteDescriptions() as $description) {
            $content .= "<div>$description</div><br>";
        }
        $content .= Invoice::getInvoiceBlade($items, $footer, $discounts, $lang);
        if ($hasOptionalItems) {
            $content .= '<div style="font-size:10pt;">'.__('pdf.quote_optional_items_note', [], $lang).'</div>';
        }
        $content .= '<br>';

        $content .= $project->param('PROJECT_SUFFIX', true)->localizedValue($lang, $formality) ?? '';
        $content .= $this->renderAcceptanceHtml($lang);

        $legal = $project->param('PROJECT_LEGAL', true)->localizedValue($lang, $formality) ?? '';
        $content .= trim(strip_tags($legal)) === '' ? '' : '<div class="legal">'.$legal.'</div>';

        $content = str_replace('[payment-plan]', $this->renderPaymentPlanHtml($project, $lang), $content);
        return $content;
    }
    private function renderAcceptanceHtml(string $lang): string {
        return '<div class="acceptance">'
            .'<div class="acceptance-title">'.__('pdf.acceptance_title', [], $lang).'</div>'
            .'<div>'.__('pdf.acceptance_hint', [], $lang).'</div>'
            .'<table style="width:100%;border-collapse:collapse;margin-top:14mm;"><tr>'
            .'<td style="width:50%;"><div class="signature-line">'.__('pdf.place_date', [], $lang).'</div></td>'
            .'<td style="width:50%;"><div class="signature-line">'.__('pdf.signature', [], $lang).'</div></td>'
            .'</tr></table></div>';
    }
    private function renderPaymentPlanHtml(Project $project, string $lang): string {
        $steps = $project->getEffectivePaymentPlan();
        if (empty($steps)) {
            return '';
        }

        $isDe      = $lang === 'de';
        $headerPct = $isDe ? '%' : '%';
        $headerDue = $isDe ? 'Fälligkeit' : 'Due';
        $headerAmt = $isDe ? 'Betrag (netto)' : 'Amount (net)';
        $net       = $project->netUnmasked();

        $rows = '';
        foreach ($steps as $step) {
            $trigger    = $step['trigger'] ?? '';
            $months     = (int)($step['months'] ?? 0);
            $years      = (int)($step['years'] ?? 0);
            $amount     = $project->planStepTotal($step, $net);
            $percentage = $net > 0 ? round($amount / $net * 100, 1) : 0;
            $formatted  = number_format($amount, 2, ',', '.');

            $label = match ($trigger) {
                'project_start'    => $isDe ? 'bei Projektstart' : 'upon project start',
                'feature_complete' => $isDe ? 'bei Feature-Complete' : 'upon feature complete',
                'acceptance'       => $isDe ? 'bei Abnahme' : 'upon acceptance',
                'monthly'          => $isDe
                    ? "{$months} monatliche Vorausrate(n) nach Projektstart"
                    : "{$months} monthly prepayment(s) after project start",
                'yearly' => $isDe
                    ? "{$years} jährliche Vorausrate(n) nach Projektstart"
                    : "{$years} yearly prepayment(s) after project start",
                default => $trigger,
            };

            $rows .= "<tr><td style='padding:3px 8px;'>{$percentage}%</td>"
                   ."<td style='padding:3px 8px;'>{$label}</td>"
                   ."<td style='padding:3px 8px; text-align:right;'>€ {$formatted}</td></tr>";
        }
        return "<table style='width:100%; border-collapse:collapse; margin:8px 0; font-size:10pt;'>"
             ."<tr style='font-weight:bold; border-bottom:1px solid #ccc;'>"
             ."<td style='padding:3px 8px;'>{$headerPct}</td>"
             ."<td style='padding:3px 8px;'>{$headerDue}</td>"
             ."<td style='padding:3px 8px; text-align:right;'>{$headerAmt}</td></tr>"
             .$rows
             .'</table>';
    }
    private function makeFileName(string $title, Project $project, string $quoteNumber): string {
        $parts = array_filter([date('Y-m-d'), $title, $quoteNumber, File::filename_safe($project->name)]);
        return implode(' ', $parts).'.pdf';
    }
}
