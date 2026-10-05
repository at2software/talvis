<?php

namespace App\Services;

use App\Enums\InvoiceItemType;
use App\Models\Expense;
use App\Models\FloatParam;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\Param;
use App\Models\Project;
use App\Models\ProjectState;
use Carbon\Carbon;

class LiquidityService {
    const INVOICE_LEAD_DAYS = 3;

    public static function getLiquidityData(): array {
        $start = now()->startOfDay();
        $end   = $start->copy()->addMonths(12);

        $globalAvgDays = (int)((float)(Param::get('INVOICE_PAYMENT_DURATION')?->value ?? 14));
        $avgDaysCache  = self::buildCompanyAvgDaysCache();

        $events = collect()
            ->merge(self::getExpenseEvents($start, $end))
            ->merge(self::getStandingOrderEvents($start, $end, $avgDaysCache, $globalAvgDays))
            ->merge(self::getOpenInvoiceEvents($start, $end))
            ->merge(self::getBudgetProjectEvents($start, $end, $avgDaysCache, $globalAvgDays))
            ->merge(self::getSupportMonthlyEvents($start, $end, $avgDaysCache, $globalAvgDays))
            ->merge(self::getDownpaymentEvents($start, $end, $avgDaysCache, $globalAvgDays))
            ->sortBy('date')
            ->values();

        $runningBalance = self::getCurrentBalance();
        $events         = $events->map(function ($event) use (&$runningBalance) {
            $runningBalance += $event['amount'];
            return array_merge($event, ['balance_after' => round($runningBalance, 2)]);
        });

        return [
            'balance' => self::getCurrentBalance(),
            'events'  => $events->values(),
        ];
    }
    protected static function getCurrentBalance(): float {
        $param = Param::get('CASHFLOW_BANK_BALANCE');
        if (! $param) {
            return 0.0;
        }
        $entry = FloatParam::where('param_id', $param->id)
            ->whereNull('parent_type')
            ->whereNull('parent_id')
            ->latest('created_at')
            ->first();
        return (float)($entry?->value ?? 0);
    }
    protected static function buildCompanyAvgDaysCache(): array {
        return Invoice::select('company_id')
            ->selectRaw('ROUND(AVG(DATEDIFF(paid_at, created_at))) as avg_days')
            ->whereNotNull('paid_at')
            ->groupBy('company_id')
            ->pluck('avg_days', 'company_id')
            ->map(fn ($v) => max(1, (int)$v))
            ->toArray();
    }
    protected static function avgDaysFor(?int $companyId, array $cache, int $default): int {
        return $companyId && isset($cache[$companyId]) ? $cache[$companyId] : $default;
    }
    protected static function getExpenseEvents(Carbon $start, Carbon $end): array {
        $events   = [];
        $expenses = Expense::whereIn('repeat', InvoiceItemType::Repeating)->get();

        foreach ($expenses as $expense) {
            $startsAt = $expense->starts_at ?: null;
            $endsAt   = $expense->ends_at ?: null;

            if ($startsAt && Carbon::parse($startsAt)->gt($end)) {
                continue;
            }
            if ($endsAt && Carbon::parse($endsAt)->lt($start)) {
                continue;
            }

            $anchor       = $startsAt ? Carbon::parse($startsAt)->startOfDay() : $start->copy();
            $effectiveEnd = $endsAt ? Carbon::parse($endsAt)->min($end) : $end->copy();

            $firstOccurrence = self::fastForwardToDate($anchor, $start, $expense->repeat);
            if ($firstOccurrence === null || $firstOccurrence->gt($effectiveEnd)) {
                continue;
            }

            foreach (self::generateRecurrences($firstOccurrence, $effectiveEnd, $expense->repeat) as $date) {
                $events[] = [
                    'date'   => $date->format('Y-m-d'),
                    'amount' => -abs($expense->price),
                    'type'   => 'expense',
                    'label'  => $expense->name,
                ];
            }
        }
        return $events;
    }
    protected static function getStandingOrderEvents(Carbon $start, Carbon $end, array $avgDaysCache, int $globalAvgDays): array {
        $events = [];
        $items  = InvoiceItem::whereIn('type', InvoiceItemType::Repeating)
            ->whereNotNull('next_recurrence_at')
            ->whereNull('invoice_id')
            ->with('company')
            ->get();

        foreach ($items as $item) {
            $recurrenceStart = Carbon::parse($item->next_recurrence_at);
            if ($recurrenceStart->gt($end)) {
                continue;
            }

            $avgDays     = self::avgDaysFor($item->company_id, $avgDaysCache, $globalAvgDays);
            $net         = abs((float)($item->net ?? ($item->price * $item->qty)));
            $companyName = $item->company?->name ?? '';
            $invoiceEnd  = $end->copy()->subDays($avgDays);

            foreach (self::generateRecurrences($recurrenceStart, $invoiceEnd, $item->type) as $invoiceDate) {
                $paymentDate = $invoiceDate->copy()->addDays($avgDays);
                if ($paymentDate->lt($start) || $paymentDate->gt($end)) {
                    continue;
                }
                $label    = trim(($item->text ?: 'Standing order').($companyName ? " ({$companyName})" : ''));
                $events[] = [
                    'date'   => $paymentDate->format('Y-m-d'),
                    'amount' => $net,
                    'type'   => 'standing_order',
                    'label'  => $label,
                ];
            }
        }
        return $events;
    }
    protected static function getOpenInvoiceEvents(Carbon $start, Carbon $end): array {
        $events   = [];
        $invoices = Invoice::whereNull('paid_at')
            ->where('is_cancelled', false)
            ->whereNull('cancellation_invoice_id')
            ->with('company')
            ->get();

        foreach ($invoices as $invoice) {
            $amount = (float)($invoice->gross_remaining ?: $invoice->gross);
            if ($amount <= 0) {
                continue;
            }

            if ($invoice->due_at) {
                $dueDate     = Carbon::parse($invoice->due_at);
                $paymentDate = $dueDate->lt($start) ? $start->copy()->addDays(14) : $dueDate;
            } else {
                $paymentDate = $start->copy()->addDays(14);
            }

            if ($paymentDate->gt($end)) {
                continue;
            }

            $invoicedOn  = Carbon::parse($invoice->created_at);
            $label       = $invoice->name.($invoice->company ? ' ('.$invoice->company->name.')' : '');
            $events[]    = [
                'date'         => $paymentDate->format('Y-m-d'),
                'amount'       => $amount,
                'type'         => 'open_invoice',
                'label'        => $label,
                'invoice_date' => $invoicedOn->format('Y-m-d'),
                'payment_days' => (int)$invoicedOn->diffInDays($paymentDate),
            ];
        }
        return $events;
    }
    protected static function getBudgetProjectEvents(Carbon $start, Carbon $end, array $avgDaysCache, int $globalAvgDays): array {
        $events   = [];
        $hpd      = (float)(Param::get('INVOICE_HPD')?->value ?? 8);
        $projects = Project::where('is_time_based', 0)
            ->whereProgress(ProjectState::Running)
            ->where('net_remaining', '>', 0)
            ->where('work_estimated', '>', 0)
            ->with('company')
            ->get();

        foreach ($projects as $project) {
            $remaining      = max(0, (float)$project->net_remaining);
            $workEstimated  = (float)$project->work_estimated;
            $hoursInvested  = (float)$project->hours_invested;
            $remainingHours = max(0, $workEstimated - $hoursInvested);
            $workDaysLeft   = $remainingHours > 0 ? (int)ceil($remainingHours / $hpd) : 0;

            $completionDate = self::addWorkingDays($start->copy(), $workDaysLeft);
            $invoiceDate    = self::addWorkingDays($completionDate, self::INVOICE_LEAD_DAYS);
            $avgDays        = self::avgDaysFor($project->company_id, $avgDaysCache, $globalAvgDays);
            $paymentDate    = $invoiceDate->copy()->addDays($avgDays);

            if ($paymentDate->gt($end)) {
                continue;
            }

            $companyName = $project->company?->name ?? '';
            $events[]    = [
                'date'         => $paymentDate->format('Y-m-d'),
                'amount'       => $remaining,
                'type'         => 'budget_project',
                'label'        => $project->name.($companyName ? " ({$companyName})" : ''),
                'invoice_date' => $invoiceDate->format('Y-m-d'),
                'payment_days' => $avgDays,
            ];
        }
        return $events;
    }
    protected static function getSupportMonthlyEvents(Carbon $start, Carbon $end, array $avgDaysCache, int $globalAvgDays): array {
        $events   = [];
        $baseWage = (float)(Param::get('HR_HOURLY_WAGE')?->value ?? 0);

        $projects = Project::wherePreparedOrRunning()
            ->whereNot('is_internal', true)
            ->where('is_time_based', true)
            ->withSum('foci_unbilled', 'duration')
            ->with('company')
            ->get();

        $byCompany = [];
        foreach ($projects as $project) {
            $amount = (float)($project->foci_unbilled_sum_duration ?? 0) * $project->getWage($baseWage);
            if ($amount <= 0) {
                continue;
            }
            $cid = $project->company_id ?? 0;
            if (! isset($byCompany[$cid])) {
                $byCompany[$cid] = ['amount' => 0.0, 'name' => $project->company?->name ?? ''];
            }
            $byCompany[$cid]['amount'] += $amount;
        }

        foreach ($byCompany as $companyId => $data) {
            $volume  = round($data['amount'], 2);
            $avgDays = self::avgDaysFor($companyId ?: null, $avgDaysCache, $globalAvgDays);
            $label   = $data['name'] ? "Monthly support ({$data['name']})" : 'Monthly support';

            $current = $start->copy()->startOfMonth()->addDay();
            if ($current->lt($start)) {
                $current->addMonth();
            }

            while ($current->lte($end)) {
                $paymentDate = $current->copy()->addDays($avgDays);
                if ($paymentDate->gt($start) && $paymentDate->lte($end)) {
                    $events[] = [
                        'date'         => $paymentDate->format('Y-m-d'),
                        'amount'       => $volume,
                        'type'         => 'support',
                        'label'        => $label,
                        'invoice_date' => $current->format('Y-m-d'),
                        'payment_days' => $avgDays,
                    ];
                }
                $current->addMonth();
            }
        }
        return $events;
    }
    protected static function getDownpaymentEvents(Carbon $start, Carbon $end, array $avgDaysCache, int $globalAvgDays): array {
        $events   = [];
        $projects = Project::where('is_time_based', 0)
            ->whereHas('invoiceItems', fn ($q) => $q->where('stage', 2)->whereNull('invoice_id'))
            ->with([
                'company',
                'invoiceItems' => fn ($q) => $q->where('stage', 2)->whereNull('invoice_id'),
            ])
            ->get();

        foreach ($projects as $project) {
            $pendingAmount = (float)$project->invoiceItems->sum('net');
            if ($pendingAmount <= 0) {
                continue;
            }

            $plan = $project->getEffectivePaymentPlan();
            if (empty($plan)) {
                continue;
            }

            $avgDays     = self::avgDaysFor($project->company_id, $avgDaysCache, $globalAvgDays);
            $companyName = $project->company?->name ?? '';

            $invoiceDate = null;
            foreach ($plan as $step) {
                $trigger     = $step['trigger'] ?? '';
                $invoiceDate = match ($trigger) {
                    'acceptance'        => $project->deadline_at ? Carbon::parse($project->deadline_at) : null,
                    'feature_complete'  => $project->deadline_at ? Carbon::parse($project->deadline_at)->subDays(14) : null,
                    'monthly', 'yearly' => $start->copy()->startOfMonth()->addDay(),
                    default             => null,
                };
                if ($invoiceDate && $invoiceDate->gte($start)) {
                    break;
                }
                $invoiceDate = null;
            }

            if (! $invoiceDate) {
                $invoiceDate = $start->copy()->addDays(30);
            }

            $paymentDate = $invoiceDate->copy()->addDays($avgDays);
            if ($paymentDate->lt($start) || $paymentDate->gt($end)) {
                continue;
            }

            $events[] = [
                'date'   => $paymentDate->format('Y-m-d'),
                'amount' => $pendingAmount,
                'type'   => 'downpayment',
                'label'  => $project->name.($companyName ? " ({$companyName})" : ''),
            ];
        }
        return $events;
    }
    protected static function fastForwardToDate(Carbon $anchor, Carbon $target, InvoiceItemType $type): ?Carbon {
        if ($anchor->gte($target)) {
            return $anchor->copy();
        }

        $result = $anchor->copy();

        switch ($type) {
            case InvoiceItemType::Daily:
                return $target->copy()->startOfDay();
            case InvoiceItemType::Weekly:
                $days = (int)$anchor->diffInDays($target);
                $result->addWeeks((int)ceil($days / 7));
                while ($result->lt($target)) {
                    $result->addWeek();
                }
                break;
            case InvoiceItemType::Monthly:
                while ($result->lt($target)) {
                    $result->addMonth();
                }
                break;
            case InvoiceItemType::Quarterly:
                while ($result->lt($target)) {
                    $result->addMonths(3);
                }
                break;
            case InvoiceItemType::Yearly:
                while ($result->lt($target)) {
                    $result->addYear();
                }
                break;
            default:
                return null;
        }

        return $result;
    }
    protected static function generateRecurrences(Carbon $from, Carbon $until, InvoiceItemType $type): array {
        $dates   = [];
        $current = $from->copy()->startOfDay();
        $safety  = 400;

        while ($current->lte($until) && $safety-- > 0) {
            $dates[] = $current->copy();
            switch ($type) {
                case InvoiceItemType::Daily:     $current->addDay();
                    break;
                case InvoiceItemType::Weekly:    $current->addWeek();
                    break;
                case InvoiceItemType::Monthly:   $current->addMonth();
                    break;
                case InvoiceItemType::Quarterly: $current->addMonths(3);
                    break;
                case InvoiceItemType::Yearly:    $current->addYear();
                    break;
                default:                         break 2;
            }
        }
        return $dates;
    }
    protected static function addWorkingDays(Carbon $date, int $days): Carbon {
        $result = $date->copy();
        $added  = 0;
        while ($added < $days) {
            $result->addDay();
            if ($result->isWeekday()) {
                $added++;
            }
        }
        return $result;
    }
}
