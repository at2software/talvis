import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { modelListResource } from '@models/http/model-resource';
import { StatsService } from '@models/stats.service';
import { GlobalService } from '@models/global.service';
import { NgxEchartsModule } from 'ngx-echarts';
import { Color } from '@constants/Color';
import { EChartsSimpleOptions, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES, ECHARTS_DONUT_TRACK_COLOR } from '@charts/echarts-presets';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import type { EChartsOption, SeriesOption } from 'echarts';
import { ChartAxisTooltipParamDto } from '@models/_core/api-response';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface PredictionAccuracyData {
    id: number;
    name: string;
    monthly_accuracy: {
        month: string;
        items_count: number;
        focused: {
            average_bias_factor: number;
            min_bias_factor: number;
            max_bias_factor: number;
            weighted_average_bias_factor: number;
        };
        unfocused: {
            average_bias_factor: number;
            min_bias_factor: number;
            max_bias_factor: number;
            weighted_average_bias_factor: number;
        };
    }[];
}

@Component({
    selector: 'hr-stats-prediction-accuracy',
    imports: [NgxEchartsModule, EmptyStateComponent, SpinnerComponent],
    templateUrl: './hr-stats-prediction-accuracy.component.html',
    styleUrl: './hr-stats-prediction-accuracy.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrStatsPredictionAccuracyComponent {
    #statsService = inject(StatsService);
    #global = inject(GlobalService);

    readonly #predictionAccuracy = modelListResource<PredictionAccuracyData>(() => this.#statsService.showPredictionAccuracy());
    readonly loaded = this.#predictionAccuracy.hasValue;
    readonly users = computed(() =>
        [...this.#predictionAccuracy.value()].sort((a, b) => this.#global.team.findIndex((t) => t.id === a.id.toString()) - this.#global.team.findIndex((t) => t.id === b.id.toString())),
    );
    readonly chartOptions = computed(() => Object.fromEntries(this.users().map((user) => [user.id, this.#createChartOptions(user)])));
    readonly donutChartOptions = computed(() => Object.fromEntries(this.users().map((user) => [user.id, this.#createDonutChartOptions(user)])));

    #createChartOptions(user: PredictionAccuracyData): EChartsOption {
        const months = user.monthly_accuracy.map((item) => item.month).sort();
        const series = this.#createSeries(user, months);
        return {
            ...EChartsSimpleOptions,
            xAxis: {
                type: 'category',
                data: months,
                show: false,
            },
            yAxis: {
                type: 'log',
                show: false,
                min: 0.1,
            },
            tooltip: {
                ...EChartsSimpleOptions.tooltip,
                backgroundColor: 'transparent',
                borderWidth: 0,
                formatter: (rawParams: unknown) => {
                    const params = rawParams as ChartAxisTooltipParamDto[];
                    const month = params[0].axisValue;
                    const monthData = user.monthly_accuracy.find((item) => item.month === month);

                    if (!monthData) return '';

                    let tooltipContent = `<div class="p-2"><strong>${month}</strong><br/>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Predictions:</span><span class="ms-2">${monthData.items_count}</span></div><br/>`;

                    const cyanColor = Color.fromVar('cyan').toHexString();
                    const primaryColor = Color.fromVar('primary').toHexString();

                    tooltipContent += `<strong style="color: ${primaryColor};">With Overhead:</strong><br/>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Average:</span><span class="ms-2">${monthData.unfocused.average_bias_factor.toFixed(2)}x</span></div>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Range:</span><span class="ms-2">${monthData.unfocused.min_bias_factor.toFixed(2)}x to ${monthData.unfocused.max_bias_factor.toFixed(2)}x</span></div><br/>`;

                    tooltipContent += `<strong style="color: ${cyanColor};">Without Overhead:</strong><br/>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Average:</span><span class="ms-2">${monthData.focused.average_bias_factor.toFixed(2)}x</span></div>`;
                    tooltipContent += `<div class="d-flex justify-content-between"><span>Range:</span><span class="ms-2">${monthData.focused.min_bias_factor.toFixed(2)}x to ${monthData.focused.max_bias_factor.toFixed(2)}x</span></div>`;
                    return `<div class="card">${tooltipContent}</div>`;
                },
            },
            series: series,
        } satisfies EChartsOption;
    }

    #createSeries(user: PredictionAccuracyData, months: string[]): SeriesOption[] {
        const monthDataMap = new Map(user.monthly_accuracy.map((item) => [item.month, item]));

        const focusedAverage = months.map((month) => monthDataMap.get(month)?.focused.average_bias_factor ?? null);
        const unfocusedAverage = months.map((month) => monthDataMap.get(month)?.unfocused.average_bias_factor ?? null);
        const rangeBase = months.map((month) => monthDataMap.get(month)?.focused.min_bias_factor ?? null);
        const rangeArea = months.map((month) => {
            const data = monthDataMap.get(month);
            return data ? data.focused.max_bias_factor - data.focused.min_bias_factor : null;
        });
        return [
            {
                name: $localize`:@@i18n.hr.rangeBase:Range Base`,
                type: 'line',
                data: rangeBase,
                lineStyle: { opacity: 0 },
                symbol: 'none',
                areaStyle: { color: 'transparent', opacity: 0 },
                stack: 'range',
                z: 1,
                tooltip: { show: false },
            },
            {
                name: $localize`:@@i18n.hr.rangeArea:Range Area`,
                type: 'line',
                data: rangeArea,
                lineStyle: { opacity: 0 },
                symbol: 'none',
                areaStyle: { color: Color.fromVar('primary').toHexString(), opacity: 0.3 },
                stack: 'range',
                z: 2,
                tooltip: { show: false },
            },
            {
                name: $localize`:@@i18n.hr.focusedAverage:Focused Average`,
                type: 'line',
                data: focusedAverage,
                lineStyle: { color: Color.fromVar('cyan').toHexString(), width: 2 },
                itemStyle: { color: Color.fromVar('cyan').toHexString() },
                symbol: 'circle',
                symbolSize: 4,
                z: 10,
            },
            {
                name: $localize`:@@i18n.hr.unfocusedAverage:Unfocused Average`,
                type: 'line',
                data: unfocusedAverage,
                lineStyle: { color: Color.fromVar('primary').toHexString(), width: 2 },
                itemStyle: { color: Color.fromVar('primary').toHexString() },
                symbol: 'circle',
                symbolSize: 4,
                z: 10,
            },
            {
                name: $localize`:@@i18n.hr.perfectPrediction:Perfect Prediction`,
                type: 'line',
                data: months.map(() => 1),
                lineStyle: { color: Color.fromVar('warning').toHexString(), width: 1, type: 'dashed' },
                itemStyle: { color: 'transparent' },
                symbol: 'none',
                z: 5,
                tooltip: { show: false },
            },
        ];
    }

    getUserForAvatar = (user: PredictionAccuracyData) => {
        return this.#global.team.find((t) => t.id === user.id.toString()) || { id: user.id.toString(), name: user.name, icon: '', badge: undefined };
    };

    #createDonutChartOptions(user: PredictionAccuracyData): EChartsOption {
        let totalWeight = 0;
        let weightedSum = 0;

        user.monthly_accuracy.forEach((month) => {
            const weight = month.items_count;
            weightedSum += month.unfocused.weighted_average_bias_factor * weight;
            totalWeight += weight;
        });

        const overallAverage = totalWeight > 0 ? weightedSum / totalWeight : 1;

        const isOverEstimated = overallAverage < 1;
        const deviation = isOverEstimated ? (1 - overallAverage) * 100 : (overallAverage - 1) * 100;
        const maxDeviation = Math.max(50, deviation * 1.2); // Ensure at least 50% range
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
                            name: isOverEstimated ? $localize`:@@i18n.hr.overEstimated:Over-estimated` : $localize`:@@i18n.hr.underEstimated:Under-estimated`,
                            itemStyle: {
                                color: isOverEstimated ? Color.fromVar('warning').toHexString() : Color.fromVar('danger').toHexString(),
                                ...ECHARTS_DONUT_ITEM_STYLE,
                            },
                        },
                        {
                            value: maxDeviation - deviation,
                            name: $localize`:@@i18n.hr.perfectRange:Perfect Range`,
                            itemStyle: {
                                color: ECHARTS_DONUT_TRACK_COLOR,
                            },
                            label: { show: false },
                            labelLine: { show: false },
                        },
                    ],
                    label: {
                        show: true,
                        position: 'center',
                        formatter: `${overallAverage.toFixed(2)}x`,
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
                    const status = isOverEstimated ? 'Over-estimating' : 'Under-estimating';
                    const factor = overallAverage.toFixed(2);
                    return `<div class="card">
                        <div class="p-2">
                            <strong>Overall Bias Factor</strong><br/>
                            <div class="d-flex justify-content-between">
                                <span>Average:</span>
                                <span class="ms-2">${factor}x</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Status:</span>
                                <span class="ms-2">${status}</span>
                            </div>
                            <div class="d-flex justify-content-between">
                                <span>Deviation:</span>
                                <span class="ms-2">${deviation.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>`;
                },
            },
        } satisfies EChartsOption;
    }
}
