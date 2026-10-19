import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { modelListResource } from '@models/http/model-resource';
import { StatsService } from '@models/stats.service';
import { GlobalService } from '@models/global.service';
import { NgxEchartsModule } from 'ngx-echarts';
import { Color } from '@constants/Color';
import { EChartsSimpleOptions, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES, ECHARTS_DONUT_TRACK_COLOR } from '@charts/echarts-presets';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import type { EChartsOption } from 'echarts';
import { ChartAxisTooltipParamDto } from '@models/_core/api-response';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface FocusAccuracyData {
    id: number;
    name: string;
    monthly_focus_accuracy: {
        month: string;
        focused_percentage_count: number;
        focused_percentage_duration: number;
        total_foci_count: number;
        focused_foci_count: number;
        total_duration: number;
        focused_duration: number;
    }[];
}

@Component({
    selector: 'hr-stats-invoice-focus',
    imports: [NgxEchartsModule, EmptyStateComponent, SpinnerComponent],
    templateUrl: './hr-stats-invoice-focus.component.html',
    styleUrl: './hr-stats-invoice-focus.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrStatsInvoiceFocusComponent {
    #statsService = inject(StatsService);
    #global = inject(GlobalService);

    readonly #focusAccuracy = modelListResource<FocusAccuracyData>(() => this.#statsService.showFocusAccuracy());
    readonly loaded = this.#focusAccuracy.hasValue;
    readonly users = computed(() =>
        [...this.#focusAccuracy.value()].sort((a, b) => this.#global.team.findIndex((t) => t.id === a.id.toString()) - this.#global.team.findIndex((t) => t.id === b.id.toString())),
    );
    readonly chartOptions = computed(() => Object.fromEntries(this.users().map((user) => [user.id, this.#createChartOptions(user)])));
    readonly donutChartOptions = computed(() => Object.fromEntries(this.users().map((user) => [user.id, this.#createDonutChartOptions(user)])));

    #createChartOptions(user: FocusAccuracyData): EChartsOption {
        const months = user.monthly_focus_accuracy.map((item) => item.month).sort();
        const countData = months.map((month) => {
            const monthData = user.monthly_focus_accuracy.find((item) => item.month === month);
            return monthData ? monthData.focused_percentage_count : null;
        });
        const durationData = months.map((month) => {
            const monthData = user.monthly_focus_accuracy.find((item) => item.month === month);
            return monthData ? monthData.focused_percentage_duration : null;
        });
        return {
            ...EChartsSimpleOptions,
            backgroundColor: 'transparent',
            xAxis: {
                type: 'category',
                data: months,
                show: false,
            },
            yAxis: {
                type: 'value',
                show: false,
                min: 0,
                max: 100,
            },
            tooltip: {
                ...EChartsSimpleOptions.tooltip,
                backgroundColor: 'transparent',
                borderWidth: 0,
                formatter: (params: unknown) => {
                    const items = params as ChartAxisTooltipParamDto[];
                    const month = items[0].axisValue;
                    const monthData = user.monthly_focus_accuracy.find((item) => item.month === month);

                    if (!monthData) return '';

                    let tooltipContent = `<div class="p-2"><strong>${month}</strong><br/>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Total Foci:</span><span class="ms-2">${monthData.total_foci_count}</span></div>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Focused Count:</span><span class="ms-2">${monthData.focused_foci_count}</span></div>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Count %:</span><span class="ms-2">${monthData.focused_percentage_count.toFixed(1)}%</span></div><br/>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Total Duration:</span><span class="ms-2">${monthData.total_duration.toFixed(1)}h</span></div>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Focused Duration:</span><span class="ms-2">${monthData.focused_duration.toFixed(1)}h</span></div>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Duration %:</span><span class="ms-2">${monthData.focused_percentage_duration.toFixed(1)}%</span></div>`;
                    return `<div class="card">${tooltipContent}</div>`;
                },
            },
            series: [
                {
                    name: $localize`:@@i18n.hr.focusAccuracyCount:Focus Accuracy (Count)`,
                    type: 'line',
                    data: countData,
                    lineStyle: {
                        color: Color.fromVar('cyan').toHexString(),
                        width: 2,
                        type: 'dashed',
                    },
                    itemStyle: {
                        color: Color.fromVar('cyan').toHexString(),
                    },
                    symbol: 'circle',
                    symbolSize: 4,
                    z: 10,
                },
                {
                    name: $localize`:@@i18n.hr.focusAccuracyDuration:Focus Accuracy (Duration)`,
                    type: 'line',
                    data: durationData,
                    lineStyle: {
                        color: Color.fromVar('primary').toHexString(),
                        width: 2,
                    },
                    itemStyle: {
                        color: Color.fromVar('primary').toHexString(),
                    },
                    symbol: 'diamond',
                    symbolSize: 4,
                    z: 10,
                },
            ],
        } satisfies EChartsOption;
    }

    #createDonutChartOptions(user: FocusAccuracyData): EChartsOption {
        const latestMonth = user.monthly_focus_accuracy.length > 0 ? user.monthly_focus_accuracy.sort((a, b) => b.month.localeCompare(a.month))[0] : null;

        const overallCountAccuracy = latestMonth ? latestMonth.focused_percentage_duration : 0;

        const deviation = overallCountAccuracy;
        const remaining = 100 - deviation;
        return {
            ...EChartsSimpleOptions,
            backgroundColor: 'transparent',
            series: [
                {
                    type: 'pie',
                    radius: ECHARTS_DONUT_SERIES.radius,
                    center: ['50%', '50%'],
                    startAngle: 90,
                    endAngle: 450,
                    data: [
                        {
                            value: deviation,
                            name: $localize`:@@i18n.hr.focused:Focused`,
                            itemStyle: { color: Color.fromVar('primary').toHexString(), ...ECHARTS_DONUT_ITEM_STYLE },
                        },
                        {
                            value: remaining,
                            name: $localize`:@@i18n.hr.unfocused:Unfocused`,
                            itemStyle: { color: ECHARTS_DONUT_TRACK_COLOR, ...ECHARTS_DONUT_ITEM_STYLE },
                        },
                    ],
                    label: {
                        show: true,
                        position: 'center',
                        formatter: `${overallCountAccuracy.toFixed(0)}%`,
                        fontSize: 16,
                        fontWeight: 300,
                        color: '#ccc',
                    },
                    labelLine: {
                        show: false,
                    },
                },
            ],
            tooltip: {
                backgroundColor: 'transparent',
                borderWidth: 0,
                formatter: () => {
                    const monthLabel = latestMonth ? latestMonth.month : 'No data';
                    return `<div class="card">
                        <div class="p-2">
                            <strong>Latest Focus Accuracy (${monthLabel})</strong><br/>
                            <div class="d-flex justify-content-between">
                                <span>Duration-weighted:</span>
                                <span class="ms-2">${overallCountAccuracy.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>`;
                },
            },
        } satisfies EChartsOption;
    }

    getUserForAvatar = (user: FocusAccuracyData) => {
        const teamMember = this.#global.team.find((t) => t.id === user.id.toString());
        return teamMember || { id: user.id.toString(), name: user.name, icon: '', badge: undefined };
    };
}
