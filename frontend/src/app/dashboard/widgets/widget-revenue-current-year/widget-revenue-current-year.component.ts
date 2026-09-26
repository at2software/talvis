import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StatsService } from '@models/stats.service';
import { BaseWidgetComponent } from '../base.widget.component';
import { EChartsStackedBarOptions } from '@charts/echarts-presets';
import { Color } from '@constants/Color';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { GlobalService } from '@models/global.service';
import { WIDGET_SHARED } from '../widgets.shared';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@charts/echarts-presets';
import type { EChartsOption } from 'echarts';
import type { TopLevelFormatterParams } from 'echarts/types/dist/shared';

import { RevenueCurrentYearDto } from '@models/_core/api-response';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-revenue-current-year',
    templateUrl: './widget-revenue-current-year.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    providers: [MoneyShortPipe],
    imports: [...WIDGET_SHARED],
})
export class WidgetRevenueCurrentYearComponent extends BaseWidgetComponent {
    #stats = inject(StatsService);
    #global = inject(GlobalService);

    defaultOptions = () => ({});

    yearProgress = () => {
        const now = new Date(), y = now.getFullYear();
        return +((now.getTime() - new Date(y, 0, 1).getTime()) / (new Date(y + 1, 0, 1).getTime() - new Date(y, 0, 1).getTime()) * 12).toFixed(4);
    };

    monthsElapsed = () => Math.max(this.yearProgress(), 0.25);

    readonly #revenue = this.optionsResource(() => this.#stats.showRevenueCurrentYear());
    readonly data = computed<RevenueCurrentYearDto | null>(() => this.#revenue.value() ?? null);
    readonly avgCost = computed(() => (this.data()?.expenses ?? 0) / 12);
    readonly avgCostYtd = computed(() => {
        const history = this.data()?.expensesByMonth ?? [];
        return history.length ? history.reduce((a, _) => a + _.sum, 0) / history.length / 12 : this.avgCost();
    });

    avgMonthlyRevenue = () => (this.data()?.revenue ?? 0) / this.monthsElapsed();

    readonly chartOptions = computed<EChartsOption>(() => {
        const data = this.data();
        if (!data) return { ...EChartsStackedBarOptions, series: [] };

        while (data.current.length < 12) data.current.push({ sum: 0 });
        while (data.last.length < 12) data.last.push({ sum: 0, month: '' });

        const categories = data.last.map((_) => _.month);

        const annualByMonth = new Map((data.expensesByMonth ?? []).map((_) => [_.month, _.sum]));
        let annual = data.expensesByMonth?.[0]?.sum ?? data.expenses;
        const monthlyCost = categories.map((m) => {
            annual = annualByMonth.get(m) ?? annual;
            return annual / 12;
        });

        const capped = (y: number, i: number) => (y > data.last[i].sum ? data.last[i].sum : y);
        const mcmax = data.current.map((_, i) => (_.sum >= monthlyCost[i] ? capped(_.sum, i) : 0));
        const mcmin = data.current.map((_, i) => (_.sum < monthlyCost[i] ? capped(_.sum, i) : 0));
        const mlcappedmax = data.current.map((_, i) => (_.sum >= monthlyCost[i] && _.sum > data.last[i].sum ? _.sum - data.last[i].sum : 0));
        const mlcappedmin = data.current.map((_, i) => (_.sum < monthlyCost[i] && _.sum > data.last[i].sum ? _.sum - data.last[i].sum : 0));
        const mlmissing = data.last.map((_, i) => (_.sum > data.current[i].sum ? _.sum - data.current[i].sum : 0));

        const maxY = Math.max(...monthlyCost.map((_) => _ * 1.1), ...data.current.map((_) => _.sum), ...data.last.map((_) => _.sum));

        const r12byMonth = new Map((data.revenue12 ?? []).map((_) => [_.month, _.sum]));
        const revenue12 = categories.map((m) => (r12byMonth.has(m) ? r12byMonth.get(m)! / 12 : null));

        const elapsed = this.monthsElapsed();
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const currentByMonth = new Map(data.current.filter((_) => _.month).map((_) => [_.month!, _.sum]));
        let accrued = 0;
        const ytdAverage = categories.map((m, i) => {
            if (!m || m > thisMonth) return null;
            accrued += currentByMonth.get(m) ?? 0;
            return accrued / Math.min(i + 1, elapsed);
        });
        const hex = (_: string) => Color.fromVar('', _).toHexString();
        const lighter = (_: string) => Color.fromVar('', _).lighten(15).toHexString();

        const colorHigh = hex('--color-primary-0');
        const colorLow = hex('--color-warning-darker');
        const colorGrowthHigh = hex('--color-primary-1');
        const colorGrowthLow = hex('--color-warning');
        const colorLowText = Color.fromVar('', '--color-warning-darker').lighten(20).toHexString();

        const coversCost = (line: (number | null)[]) => {
            const last = line.reduce<number>((acc, _, i) => (_ == null ? acc : i), -1);
            return last < 0 || line[last]! >= monthlyCost[last];
        };
        const costColor = '#ffffff';
        const ytdColor = coversCost(ytdAverage) ? hex('--color-success') : hex('--color-danger');
        const r12Color = coversCost(revenue12) ? lighter('--color-success') : lighter('--color-danger');

        return ({
            ...EChartsStackedBarOptions,
            xAxis: { type: 'category', data: categories, show: false },
            yAxis: { type: 'value', min: 0, max: maxY, show: false },
            tooltip: {
                trigger: 'axis',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: (params: TopLevelFormatterParams) => {
                    const arr = [params].flat();
                    const i = arr[0].dataIndex!;
                    const revenueCurrentYear = mcmax[i] + mcmin[i] + mlcappedmax[i] + mlcappedmin[i];
                    const revenueLastYear = mcmax[i] + mcmin[i] + mlmissing[i];
                    const above = data.current[i].sum >= monthlyCost[i];
                    const currentColor = above ? colorHigh : colorLowText;
                    const lastColor = above ? colorGrowthHigh : colorGrowthLow;
                    const f = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
                    const sym = this.#global.currencySymbol();
                    const month = categories[i];
                    const r12 = revenue12[i];
                    const r12Row =
                        r12 == null
                            ? ''
                            : `<div class="hstack gap-2 w-100" style="color:${r12Color}"><div class="flex-fill"><strong>Ø ${$localize`:@@i18n.dashboard.revenue12m:Revenue (12m)`}:</strong></div><div class="text-end"> ${r12.toLocaleString(undefined, f)} ${sym}</div></div>`;
                    const ytd = ytdAverage[i];
                    const ytdRow =
                        ytd == null
                            ? ''
                            : `<div class="hstack gap-2 w-100" style="color:${ytdColor}"><div class="flex-fill"><strong>Ø ${$localize`:@@i18n.dashboard.avgRevenueYtd:Revenue (YTD)`}:</strong></div><div class="text-end"> ${ytd.toLocaleString(undefined, f)} ${sym}</div></div>`;
                    return `<div class="p-2 w-100">
                        ${month ? `<div class="text-muted mb-1 notranslate">${month}</div>` : ''}
                        <div class="hstack gap-2 w-100" style="color:${currentColor}"><div class="flex-fill"><strong>Current Year:</strong></div><div class="text-end"> ${revenueCurrentYear.toLocaleString(undefined, f)} ${sym}</div></div>
                        <div class="hstack gap-2 w-100" style="color:${lastColor}"><div class="flex-fill"><strong>Last Year:</strong></div><div class="text-end"> ${revenueLastYear.toLocaleString(undefined, f)} ${sym}</div></div>
                        <div class="hstack gap-2 w-100" style="color:${costColor}"><div class="flex-fill"><strong>Monthly Cost:</strong></div><div class="text-end"> ${monthlyCost[i].toLocaleString(undefined, f)} ${sym}</div></div>
                        ${ytdRow}
                        ${r12Row}
                    </div>`;
                },
            },
            series: [
                { name: $localize`:@@i18n.dashboard.highRevenue:High Revenue (≥ Avg Cost)`, type: 'bar' as const, stack: 'revenue', itemStyle: { color: colorHigh }, data: mcmax },
                { name: $localize`:@@i18n.dashboard.lowRevenue:Low Revenue (< Avg Cost)`, type: 'bar' as const, stack: 'revenue', itemStyle: { color: colorLow }, data: mcmin },
                { name: $localize`:@@i18n.dashboard.growthHighRevenue:Growth High Revenue`, type: 'bar' as const, stack: 'revenue', itemStyle: { color: colorGrowthHigh }, data: mlcappedmax },
                { name: $localize`:@@i18n.dashboard.growthLowRevenue:Growth Low Revenue`, type: 'bar' as const, stack: 'revenue', itemStyle: { color: colorGrowthLow }, data: mlcappedmin },
                { name: $localize`:@@i18n.dashboard.missingVsLastYear:Missing vs Last Year`, type: 'bar' as const, stack: 'revenue', itemStyle: { color: '#444444' }, data: mlmissing },
                { name: $localize`:@@i18n.dashboard.monthlyCost:Monthly Cost`, type: 'line' as const, itemStyle: { color: costColor, borderWidth: 2 }, lineStyle: { color: costColor, width: 2 }, symbol: 'none', data: monthlyCost },
                { name: $localize`:@@i18n.dashboard.revenue12m:Revenue (12m)`, type: 'line' as const, smooth: true, connectNulls: true, itemStyle: { color: r12Color }, lineStyle: { color: r12Color, width: 2 }, symbol: 'none', data: revenue12 },
                { name: $localize`:@@i18n.dashboard.avgRevenueYtd:Revenue (YTD)`, type: 'line' as const, smooth: true, connectNulls: false, itemStyle: { color: ytdColor }, lineStyle: { color: ytdColor, width: 2, type: 'dotted' as const }, symbol: 'none', data: ytdAverage },
            ],
        });
    });
}
