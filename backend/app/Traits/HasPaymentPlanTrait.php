<?php

namespace App\Traits;

use App\Enums\InvoiceItemType;
use App\Models\InvoiceItem;
use App\Models\Param;
use Illuminate\Support\Collection;

trait HasPaymentPlanTrait {
    public function getEffectivePaymentPlan(): array {
        $projectSpecific = $this->param('PROJECT_PAYMENT_PLAN', false)->value;
        $steps           = $projectSpecific
            ? $this->parsePlanSteps($projectSpecific)
            : ($this->getMatchingTier()['steps'] ?? []);
        return $this->sortPlanSteps($steps);
    }
    public function getEffectiveTierLabel(): ?string {
        if ($this->param('PROJECT_PAYMENT_PLAN', false)->value) {
            return null; // project-specific, no tier applies
        }
        return $this->getMatchingTier()['label'] ?? null;
    }
    public function hasProjectSpecificPaymentPlan(): bool {
        return (bool)$this->param('PROJECT_PAYMENT_PLAN', false)->value;
    }
    public function getMatchingTier(): ?array {
        $tiersJson = Param::get('PROJECT_PAYMENT_PLAN_TIERS')?->value;
        if (! $tiersJson) {
            return null;
        }

        $tiers = is_string($tiersJson) ? json_decode($tiersJson, true) : null;
        if (! is_array($tiers) || empty($tiers)) {
            return null;
        }

        $net = $this->netUnmasked();
        foreach ($tiers as $tier) {
            $threshold = $tier['threshold'] ?? null;
            if ($threshold === null || $net < $threshold) {
                return $tier;
            }
        }
        return end($tiers) ?: null;
    }
    public function getPaymentPlanOverview(): array {
        $net          = $this->netUnmasked();
        $instalments  = $this->expandPlanSteps($this->getEffectivePaymentPlan(), $net);
        $downpayments = $this->downpaymentItemsForMatching();

        [$matched, $rest] = $this->matchDownpayments($instalments, $downpayments);

        return [
            'net'        => round($net, 2),
            'is_custom'  => $this->hasProjectSpecificPaymentPlan(),
            'tier_label' => $this->getEffectiveTierLabel(),
            'steps'      => $matched,
            'unmatched'  => $rest->map(fn (InvoiceItem $_) => $this->describeDownpayment($_))->values()->all(),
        ];
    }
    private function downpaymentItemsForMatching(): Collection {
        return $this->invoiceItems()
            ->whereStage(2)
            ->whereIn('type', InvoiceItemType::ProjectTotal)
            ->with('invoice:id,name,created_at,sent,paid_at')
            ->oldest('id')
            ->get();
    }
    private function expandPlanSteps(array $steps, float $net): array {
        $expanded = [];
        foreach ($steps as $step) {
            $percentage = (float)($step['percentage'] ?? 0);
            $trigger    = $step['trigger'] ?? '';
            $months     = (int)($step['months'] ?? 0);
            $total      = $net * $percentage / 100;
            $count      = $trigger === 'monthly' && $months > 0 ? $months : 1;

            for ($i = 1; $i <= $count; $i++) {
                $expanded[] = [
                    'trigger'     => $trigger,
                    'percentage'  => round($percentage / $count, 4),
                    'months'      => $count > 1 ? $months : null,
                    'month_index' => $count > 1 ? $i : null,
                    'amount'      => round($total / $count, 2),
                    'status'      => 'open',
                    'item'        => null,
                ];
            }
        }
        return $expanded;
    }
    private function matchDownpayments(array $steps, Collection $items): array {
        $open = $items->keyBy('id');

        foreach ([0.01, 0.02] as $tolerance) {
            foreach ($steps as $i => $step) {
                if ($steps[$i]['item'] !== null) {
                    continue;
                }
                $allowed = $tolerance <= 0.01 ? 0.01 : $step['amount'] * $tolerance;
                $match   = $open->first(fn (InvoiceItem $_) => abs((float)$_->net - $step['amount']) <= $allowed);
                if (! $match) {
                    continue;
                }
                $open->forget($match->id);
                $steps[$i]['item']   = $this->describeDownpayment($match);
                $steps[$i]['status'] = $match->invoice_id ? 'invoiced' : 'prepared';
            }
        }
        return [$steps, $open];
    }
    private function describeDownpayment(InvoiceItem $item): array {
        return [
            'id'      => $item->id,
            'text'    => $item->text,
            'net'     => (float)$item->net,
            'invoice' => $item->invoice ? [
                'id'         => $item->invoice->id,
                'name'       => $item->invoice->name,
                'created_at' => $item->invoice->created_at,
                'sent'       => $item->invoice->sent,
                'paid_at'    => $item->invoice->paid_at,
            ] : null,
        ];
    }
    private function sortPlanSteps(array $steps): array {
        $order = ['project_start' => 0, 'monthly' => 1, 'feature_complete' => 2, 'acceptance' => 3];
        usort($steps, fn ($a, $b) => ($order[$a['trigger'] ?? ''] ?? 99) <=> ($order[$b['trigger'] ?? ''] ?? 99));
        return $steps;
    }
    private function parsePlanSteps(mixed $value): array {
        if (! $value) {
            return [];
        }
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : [];
        }
        return [];
    }
}
