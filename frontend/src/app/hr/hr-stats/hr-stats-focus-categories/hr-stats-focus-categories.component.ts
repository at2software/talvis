import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { modelListResource } from '@models/http/model-resource';
import { StatsService } from '@models/stats.service';
import { GlobalService } from '@models/global.service';
import { NgxEchartsModule } from 'ngx-echarts';
import { Color } from '@constants/Color';
import { EChartsSimpleOptions, ECHARTS_DEFAULT_TOOLTIP_OPTIONS, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES } from '@charts/echarts-presets';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { Dictionary } from '@constants/constants';
import type { EChartsOption, SeriesOption } from 'echarts';
import { ChartAxisTooltipParamDto } from '@models/_core/api-response';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface FocusCategoryData {
    id: number;
    name: string;
    categories: {
        orga?: { month: string; sum: number }[];
        unpaid?: { month: string; sum: number }[];
        time_based_customers?: { month: string; sum: number }[];
        time_based_projects?: { month: string; sum: number }[];
        budget_projects?: { month: string; sum: number }[];
        internal_projects?: { month: string; sum: number }[];
    };
}

@Component({
    selector: 'hr-stats-focus-categories',
    imports: [NgxEchartsModule, EmptyStateComponent, SpinnerComponent],
    templateUrl: './hr-stats-focus-categories.component.html',
    styleUrl: './hr-stats-focus-categories.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrStatsFocusCategoriesComponent {
    #statsService = inject(StatsService);
    #global = inject(GlobalService);

    readonly #focusCategories = modelListResource<FocusCategoryData>(() => this.#statsService.showFocusCategories());
    readonly loaded = this.#focusCategories.hasValue;
    readonly users = computed(() =>
        [...this.#focusCategories.value()].sort((a, b) => this.#global.team.findIndex((t) => t.id === a.id.toString()) - this.#global.team.findIndex((t) => t.id === b.id.toString())),
    );
    readonly chartOptions = computed(() => Object.fromEntries(this.users().map((user) => [user.id, this.#createChartOptions(user)])));
    readonly donutChartOptions = computed(() => Object.fromEntries(this.users().map((user) => [user.id, this.#createDonutChartOptions(user)])));

    #categoryColors = {
        orga: '#333333',
        unpaid: Color.fromVar('red').toHexString(),
        time_based_customers: Color.fromVar('cyan').toHexString(),
        time_based_projects: Color.fromVar('cyan').toHexString(),
        budget_projects: Color.fromVar('blue').toHexString(),
        internal_projects: Color.fromVar('purple').toHexString(),
    };

    #createChartOptions(user: FocusCategoryData): EChartsOption {
        const months = this.#getAllMonths(user);
        const series = this.#createSeries(user, months);
        const requiredHoursLine = this.#createRequiredHoursLine(user, months);
        return {
            ...EChartsSimpleOptions,
            xAxis: {
                type: 'category',
                data: months,
                show: false,
            },
            yAxis: {
                type: 'value',
                show: false,
            },
            tooltip: {
                ...EChartsSimpleOptions.tooltip,
                formatter: (rawParams: unknown) => {
                    const params = rawParams as ChartAxisTooltipParamDto[];
                    const month = params[0].axisValue;
                    let tooltipContent = `<div class="p-2"><strong>${month}</strong><br/>`;

                    const categoryParams = params.filter((p) => p.seriesName !== $localize`@@i18n.hr.required_hours`);
                    const requiredParam = params.find((p) => p.seriesName === $localize`@@i18n.hr.required_hours`);

                    let totalActual = 0;
                    categoryParams.reverse().forEach((param) => {
                        if (param.value && param.value > 0) {
                            const seriesColor = param.color;
                            const value = param.value.toFixed(1);
                            tooltipContent += `<div class="d-flex justify-content-between"><span style="color: ${seriesColor};">${param.seriesName}</span><span class="ms-2">${value}h</span></div>`;
                            totalActual += param.value;
                        }
                    });

                    if (categoryParams.length > 0) {
                        const totalValue = totalActual.toFixed(1);
                        tooltipContent += `<br/><div class="d-flex justify-content-between"><strong>${$localize`@@i18n.hr.total_actual`}</strong><strong class="ms-2">${totalValue}h</strong></div>`;
                    }

                    if (requiredParam?.value && requiredParam.value > 0) {
                        const requiredColor = requiredParam.color;
                        const requiredValue = requiredParam.value.toFixed(1);
                        tooltipContent += `<div class="d-flex justify-content-between"><span style="color: ${requiredColor};">${requiredParam.seriesName}</span><span class="ms-2">${requiredValue}h</span></div>`;
                    }
                    return tooltipContent + '</div>';
                },
            },
            series: [...series, requiredHoursLine],
        } satisfies EChartsOption;
    }

    #getAllMonths(user: FocusCategoryData): string[] {
        const monthSet = new Set<string>();

        Object.values(user.categories).forEach((categoryData) => {
            if (categoryData) {
                categoryData.forEach((entry) => {
                    monthSet.add(entry.month);
                });
            }
        });
        return Array.from(monthSet).sort();
    }

    #createSeries(user: FocusCategoryData, months: string[]): SeriesOption[] {
        const series: SeriesOption[] = [];

        Object.entries(user.categories).forEach(([categoryName, categoryData]) => {
            if (categoryData && categoryData.length > 0) {
                const data = months.map((month) => {
                    const entry = categoryData.find((d) => d.month === month);
                    return entry ? entry.sum : 0;
                });

                const color = this.#getCategoryColor(categoryName);
                series.push({
                    name: this.#formatCategoryName(categoryName),
                    type: 'bar',
                    stack: 'total',
                    data: data,
                    itemStyle: {
                        color: color,
                    },
                });
            }
        });
        return series;
    }

    #createRequiredHoursLine(user: FocusCategoryData, months: string[]): SeriesOption {
        const requiredHoursData = months.map((month) => {
            return this.#calculateRequiredHoursForMonth(user, month);
        });
        return {
            name: $localize`@@i18n.hr.required_hours`,
            type: 'line',
            data: requiredHoursData,
            lineStyle: {
                color: '#666666',
                width: 1,
            },
            itemStyle: {
                color: '#666666',
            },
            symbol: 'none',
        };
    }

    #calculateRequiredHoursForMonth(user: FocusCategoryData, monthStr: string): number {
        const teamUser = this.#global.team.find((u) => u.id === user.id.toString() || parseInt(u.id) === user.id);
        if (!teamUser?.active_employment) return 0;
        return teamUser.active_employment.calculateRequiredHoursForMonth(monthStr);
    }

    #formatCategoryName(categoryName: string): string {
        const nameMap: Dictionary<string> = {
            orga: $localize`@@i18n.hr.organizational`,
            unpaid: $localize`@@i18n.hr.unpaid_work`,
            time_based_customers: $localize`@@i18n.hr.time_based_customers`,
            time_based_projects: $localize`@@i18n.hr.time_based_projects`,
            budget_projects: $localize`@@i18n.hr.budget_projects`,
            internal_projects: $localize`@@i18n.hr.internal_projects`,
        };
        return nameMap[categoryName] || categoryName;
    }

    #createDonutChartOptions(user: FocusCategoryData): EChartsOption | null {
        const categoryTotals = this.#calculateCategoryTotals(user);
        const totalTime = Object.values(categoryTotals).reduce((sum, value) => sum + value, 0);

        if (totalTime === 0) {
            return null;
        }

        const profitableCategories = ['budget_projects', 'time_based_projects', 'time_based_customers'];
        const profitableTime = profitableCategories.reduce((sum, category) => {
            return sum + (categoryTotals[category] || 0);
        }, 0);
        const profitablePercentage = (profitableTime / totalTime) * 100;

        const pieData = Object.entries(categoryTotals)
            .filter(([, value]) => value > 0)
            .map(([categoryName, value]) => ({
                name: this.#formatCategoryName(categoryName),
                value: value,
                itemStyle: { color: this.#getCategoryColor(categoryName), ...ECHARTS_DONUT_ITEM_STYLE },
            }));
        return {
            backgroundColor: 'transparent',
            animation: false,
            tooltip: {
                trigger: 'item',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: (rawParams: unknown) => {
                    const params = rawParams as { color: string; value: number; name: string; percent: number };
                    const seriesColor = params.color;
                    const value = params.value.toFixed(1);
                    return `<div class="p-2">
                        <div class="d-flex justify-content-between"><span style="color: ${seriesColor};"><strong>${params.name}</strong></span></div>
                        <div class="d-flex justify-content-between"><span>Hours</span><span class="ms-2">${value}h</span></div>
                        <div class="d-flex justify-content-between"><span>Percentage</span><span class="ms-2"><strong>${params.percent}%</strong></span></div>
                    </div>`;
                },
            },
            series: [
                {
                    type: 'pie',
                    radius: ECHARTS_DONUT_SERIES.radius,
                    center: ['50%', '50%'],
                    data: pieData,
                    label: {
                        show: false,
                    },
                    emphasis: {
                        label: {
                            show: false,
                        },
                    },
                },
                {
                    type: 'pie',
                    radius: ['72%', '75%'], // Thin ring outside main donut (3px thick)
                    center: ['50%', '50%'],
                    data: [
                        { value: 100 - profitablePercentage, itemStyle: { color: 'transparent' } }, // First part transparent
                        { value: profitablePercentage, itemStyle: { color: profitablePercentage >= 30 ? Color.fromVar('success').darken(20).toHexString() : Color.fromVar('danger').darken(10).toHexString() } }, // Profitable work percentage at the end
                    ],
                    startAngle: 90, // Start at top (12 o'clock)
                    label: {
                        show: false,
                    },
                    tooltip: {
                        show: false,
                    },
                    emphasis: {
                        disabled: true,
                    },
                },
                {
                    type: 'pie',
                    radius: ['0%', '0%'], // Invisible pie for text positioning
                    center: ['50%', '50%'],
                    data: [
                        {
                            value: 1,
                            label: {
                                show: true,
                                position: 'center',
                                formatter: `${profitablePercentage.toFixed(0)}%`,
                                fontSize: 14,
                                fontWeight: 'bold',
                                color: profitablePercentage >= 30 ? Color.fromVar('success').darken(20).toHexString() : Color.fromVar('danger').darken(10).toHexString(),
                            },
                            itemStyle: {
                                color: 'transparent',
                            },
                        },
                    ],
                    tooltip: {
                        trigger: 'item',
                        ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                        formatter: () => {
                            return `<div class="p-2">
                            <strong>${$localize`@@i18n.hr.profitability`}: ${profitablePercentage.toFixed(1)}%</strong><br/>
                            <span>${$localize`@@i18n.hr.percentage_paid_targets`}</span><br/>
                            <small>(${$localize`@@i18n.hr.budget_projects`} + ${$localize`@@i18n.hr.time_based_projects`} + ${$localize`@@i18n.hr.time_based_customers`})</small>
                        </div>`;
                        },
                    },
                    emphasis: {
                        disabled: true,
                    },
                },
            ],
        } satisfies EChartsOption;
    }

    #calculateCategoryTotals(user: FocusCategoryData): Dictionary<number> {
        const totals: Dictionary<number> = {};

        Object.entries(user.categories).forEach(([categoryName, categoryData]) => {
            if (categoryData) {
                const total = categoryData.reduce((sum, entry) => sum + entry.sum, 0);
                if (total > 0) {
                    totals[categoryName] = total;
                }
            }
        });
        return totals;
    }

    #getCategoryColor(categoryName: string): string {
        const colorMap: Dictionary<string> = {
            orga: this.#categoryColors.orga,
            unpaid: this.#categoryColors.unpaid,
            time_based_customers: this.#categoryColors.time_based_customers,
            time_based_projects: this.#categoryColors.time_based_projects,
            budget_projects: this.#categoryColors.budget_projects,
            internal_projects: this.#categoryColors.internal_projects,
        };
        return colorMap[categoryName] || '#999999';
    }
}
