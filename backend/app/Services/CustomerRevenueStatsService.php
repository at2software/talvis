<?php

namespace App\Services;

use App\Enums\InvoiceItemType;
use App\Models\Company;
use App\Models\ProductGroup;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CustomerRevenueStatsService {
    private const X_AXES = ['cross_sell_ratio', 'customer_age', 'lifetime_revenue', 'project_count', 'months_since_last'];

    public static function getScatterData(?string $xAxis = null): array {
        $companies = Company::query()
            ->whereHas('invoices')
            ->where('is_deprecated', false)
            ->with(['earliestInvoice.invoiceItems' => fn ($q) => $q->whereIn('type', InvoiceItemType::Total)
                ->select('id', 'invoice_id', 'project_id', 'product_source_id', 'net', 'created_at', 'type')])
            ->get();

        if ($companies->isEmpty()) {
            return ['x_axis' => $xAxis ?? 'all', 'points' => []];
        }

        $companyIds = $companies->pluck('id');

        $typeValues = array_map(fn ($e) => $e->value, InvoiceItemType::Total);

        $allItems = DB::table('invoice_items')
            ->whereNull('invoice_items.deleted_at')
            ->join('invoices', 'invoice_items.invoice_id', '=', 'invoices.id')
            ->whereIn('invoices.company_id', $companyIds)
            ->where('invoices.is_cancelled', false)
            ->whereIn('invoice_items.type', $typeValues)
            ->whereNotNull('invoice_items.invoice_id')
            ->select(
                'invoice_items.net',
                'invoice_items.project_id',
                'invoice_items.product_source_id',
                'invoice_items.created_at',
                'invoices.company_id',
            )
            ->get();

        $allProductSourceIds = $allItems->pluck('product_source_id')->filter()->unique()->values();
        $allItemsByCompany   = $allItems->groupBy('company_id');
        unset($allItems); // free memory

        $allGroups    = ProductGroup::query()->select('id', 'product_group_id', 'name', 'color')->get()->keyBy('id');
        $rootGroupMap = [];
        foreach ($allGroups as $groupId => $group) {
            $rootGroupMap[(int)$groupId] = self::resolveRootGroup((int)$groupId, $allGroups);
        }

        $productGroupIdBySourceId = DB::table('products')->whereIn('id', $allProductSourceIds)->pluck('product_group_id', 'id');

        $projectCountByCompany  = DB::table('projects')->whereIn('company_id', $companyIds)->groupBy('company_id')
            ->selectRaw('company_id, COUNT(*) as cnt')->pluck('cnt', 'company_id');
        $lastInvoiceAtByCompany = DB::table('invoices')->whereIn('company_id', $companyIds)->groupBy('company_id')
            ->selectRaw('company_id, MAX(created_at) as last_at')->pluck('last_at', 'company_id');

        $axes   = $xAxis ? [$xAxis] : self::X_AXES;
        $points = [];

        foreach ($companies as $company) {
            $earliest = $company->earliestInvoice;
            if (! $earliest) {
                continue;
            }

            $companyItems = $allItemsByCompany->get($company->id, collect());

            $revenue = self::categorizeRevenue($company, $earliest, $companyItems, $rootGroupMap, $productGroupIdBySourceId);
            if ($revenue['total'] == 0) {
                continue;
            }

            $xValues = [];
            foreach ($axes as $axis) {
                $xValues[$axis] = self::computeXAxis(
                    $company, $axis, $companyItems, $rootGroupMap, $productGroupIdBySourceId,
                    $projectCountByCompany, $lastInvoiceAtByCompany,
                );
            }

            if ($xAxis && $xValues[$xAxis] === null) {
                continue;
            }

            $point = [
                'id'                  => $company->id,
                'name'                => $company->name ?? $company->customer_number,
                'new_revenue'         => round($revenue['new'], 2),
                'followup_revenue'    => round($revenue['followup'], 2),
                'total_revenue'       => round($revenue['total'], 2),
                'customer_age_months' => $earliest->created_at ? (int)$earliest->created_at->diffInMonths(now()) : 0,
                'initial_group_id'    => $revenue['initial_group_id'],
                'initial_group_name'  => $revenue['initial_group_name'],
                'initial_group_color' => $revenue['initial_group_color'],
            ];

            $point['x'] = $xAxis ? $xValues[$xAxis] : $xValues;

            $points[] = $point;
        }

        return [
            'x_axis' => $xAxis ?? 'all',
            'points' => $points,
        ];
    }

    private static function resolveRootGroup(int $groupId, Collection $allGroups): ?object {
        $current = $allGroups->get($groupId);
        if (! $current) {
            return null;
        }
        $visited = [];
        while ($current->product_group_id && $allGroups->has($current->product_group_id)) {
            if (isset($visited[$current->id])) {
                break; // cycle guard
            }
            $visited[$current->id] = true;
            $current               = $allGroups->get($current->product_group_id);
        }
        return $current;
    }

    private static function categorizeRevenue(
        Company $company,
        $earliestInvoice,
        Collection $companyItems,
        array $rootGroupMap,
        $productGroupIdBySourceId,
    ): array {
        $initialProjectIds = $earliestInvoice->invoiceItems
            ->whereNotNull('project_id')
            ->pluck('project_id')
            ->unique()
            ->values();

        if ($initialProjectIds->isEmpty() && $earliestInvoice->created_at) {
            $initialProjectIds = $company->projects()
                ->where('created_at', '<=', $earliestInvoice->created_at->copy()->addMonths(3))
                ->orderBy('created_at')
                ->limit(3)
                ->pluck('id');
        }

        $newCutoff    = $earliestInvoice->created_at->copy()->addMonths(12);
        $newCutoffStr = $newCutoff->format('Y-m-d H:i:s'); // string for comparison with stdClass rows

        $newRevenue      = 0;
        $followupRevenue = 0;

        foreach ($companyItems as $item) {
            $isNew = $item->created_at <= $newCutoffStr && (
                ($initialProjectIds->isNotEmpty() && $initialProjectIds->contains($item->project_id))
                || $item->project_id === null
            );

            if ($isNew) {
                $newRevenue += $item->net;
            } else {
                $followupRevenue += $item->net;
            }
        }

        $initialRootGroup = null;
        foreach ($earliestInvoice->invoiceItems as $item) {
            if (! $item->product_source_id) {
                continue;
            }
            $groupId = $productGroupIdBySourceId->get($item->product_source_id);
            if (! $groupId) {
                continue;
            }
            $rootGroup = $rootGroupMap[$groupId] ?? null;
            if ($rootGroup) {
                $initialRootGroup = $rootGroup;
                break;
            }
        }

        return [
            'new'                 => $newRevenue,
            'followup'            => $followupRevenue,
            'total'               => $newRevenue + $followupRevenue,
            'initial_group_id'    => $initialRootGroup?->id,
            'initial_group_name'  => $initialRootGroup?->name,
            'initial_group_color' => $initialRootGroup?->color,
        ];
    }

    private static function computeXAxis(
        Company $company,
        string $xAxis,
        Collection $companyItems,
        array $rootGroupMap,
        $productGroupIdBySourceId,
        $projectCountByCompany,
        $lastInvoiceAtByCompany,
    ): ?float {
        return match ($xAxis) {
            'cross_sell_ratio'  => self::crossSellRatio($companyItems, $rootGroupMap, $productGroupIdBySourceId),
            'customer_age'      => $company->earliestInvoice?->created_at
                ? (float)$company->earliestInvoice->created_at->diffInMonths(now())
                : null,
            'lifetime_revenue'  => (float)$companyItems->sum('net'),
            'project_count'     => (float)($projectCountByCompany->get($company->id) ?? 0),
            'months_since_last' => $lastInvoiceAtByCompany->has($company->id)
                ? (float)now()->diffInMonths($lastInvoiceAtByCompany->get($company->id))
                : null,
            default             => null,
        };
    }

    private static function crossSellRatio(
        Collection $companyItems,
        array $rootGroupMap,
        $productGroupIdBySourceId,
    ): ?float {
        $itemsWithSource = $companyItems->filter(fn ($item) => $item->product_source_id !== null);

        if ($itemsWithSource->isEmpty()) {
            return null;
        }

        $rootGroupIds = $itemsWithSource->map(function ($item) use ($rootGroupMap, $productGroupIdBySourceId) {
            $groupId = $productGroupIdBySourceId->get($item->product_source_id);
            if (! $groupId) {
                return null;
            }
            return $rootGroupMap[$groupId]?->id ?? null;
        })->filter()->unique();

        $distinctGroups = $rootGroupIds->count();

        return $distinctGroups > 0
            ? round(($distinctGroups - 1) / $distinctGroups, 4)
            : null;
    }
}
