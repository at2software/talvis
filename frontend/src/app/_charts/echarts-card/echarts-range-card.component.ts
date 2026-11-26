import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, input, untracked } from '@angular/core';
import { EchartsParamCardComponent } from './echarts-param-card.component';

import { Color } from '@constants/Color';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS, EChartsRangeAreaOptions, EChartsDualShadowAreaStyle } from '../echarts-presets';
import { dayjs } from '@constants/date/dates';
import { CASHFLOW_I18N } from '@dashboard/widgets/widget-cashflow/widget-cashflow.options';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { LineSeriesOption } from 'echarts';
import type { TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { ParamChartSeriesDto, ParamChartPointDto } from '@models/_core/api-response';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'echarts-range-card',
    templateUrl: './echarts-card.component.html',
    styleUrls: ['./echarts-card.component.scss'],
    imports: [NgxEchartsDirective],
})
export class EchartsRangeCardComponent extends EchartsParamCardComponent {
    computeTrend = input<boolean>(true);
    seriesCount = input<number>(1);

    #formatNumber = (value: number) => Intl.NumberFormat(this.global.locale, { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    /** Area under a line: darker than the line on dark surfaces, lighter on light ones. */
    #areaColor = (lineColor: string) => (untracked(this.theme) === 'light' ? new Color(lineColor).lighten(25) : new Color(lineColor).darken(25)).toHexString();

    get primaryColorVar(): string {
        return `var(--bs-${this.getColor(0)})`;
    }

    startOfStats = () => dayjs().startOf('month').subtract(36, 'month');

    individualOptions = () => ({
        ...EChartsRangeAreaOptions,
        series: [],
    });

    updateSeries(result: ParamChartSeriesDto[]): void {
        if (!result || result.length === 0) return;

        const findNode = (d: string, a: ParamChartPointDto[]) => a?.find((_) => _.x == d);

        this.value.set(result.length && result[0].current != null ? result[0].current : 0);

        result.forEach((_) => {
            const blanko: ParamChartPointDto[] = [];
            let last: ParamChartPointDto | undefined = undefined;
            for (let i = this.startOfStats(); i.isBefore(dayjs()); i = i.add(1, 'month')) {
                const date = i.format('YYYY-MM-01');
                const node = findNode(date, _['data']);
                last = node ? node : last;
                blanko.push(last ? last : { x: date, y: 0, min: 0, max: 0 });
            }
            _['data'] = blanko;
        });

        const useSharedStack = result.length > 1;
        let maxVal = 0;

        if (useSharedStack) {
            const aggregateByDate: Dictionary<number> = {};
            result.forEach((_) => {
                _.data.forEach((__) => {
                    const avg = (__.min + __.max) / 2;
                    aggregateByDate[__.x] = (aggregateByDate[__.x] || 0) + avg;
                });
            });
            maxVal = Math.max(...Object.values(aggregateByDate), 0);
        } else {
            result.forEach((_, i: number) => {
                _.data.forEach((__) => {
                    if (this.offset() == 'none' || i == 0) {
                        maxVal = Math.max(maxVal, __.max);
                    }
                });
            });
        }

        const padding = maxVal * 0.2;

        const echartsData: (LineSeriesOption & { showInLegend?: boolean })[] = [];
        const sharedStackName = 'combined';

        if (useSharedStack) {
            result.forEach((_, i: number) => {
                const baseColor = Color.fromVar(this.getColor(i));
                const areaColor = baseColor.toHexString();

                echartsData.push({
                    name: CASHFLOW_I18N(_.name),
                    type: 'line',
                    data: _.data.map((__) => [__.x, (__.min + __.max) / 2]),
                    lineStyle: {
                        color: baseColor.toHexString(),
                        width: 2,
                    },
                    symbol: 'none',
                    areaStyle: {
                        color: this.#areaColor(areaColor),
                        ...EChartsDualShadowAreaStyle,
                    },
                    stack: sharedStackName,
                    z: 10 + i,
                });
            });
        } else {
            result.forEach((_, i: number) => {
                const baseColor = Color.fromVar(this.getColor(i));
                const areaColor = baseColor.toHexString();

                echartsData.push({
                    name: `${CASHFLOW_I18N(_.name)} Base`,
                    type: 'line',
                    data: _.data.map((__) => [__.x, __.min]),
                    lineStyle: { opacity: 0 },
                    symbol: 'none',
                    areaStyle: { color: 'transparent', opacity: 0 },
                    stack: `range_${i}`,
                    z: 1,
                    showInLegend: false,
                });

                echartsData.push({
                    name: `${CASHFLOW_I18N(_.name)} Range`,
                    type: 'line',
                    data: _.data.map((__) => [__.x, __.max - __.min]),
                    lineStyle: { opacity: 0 },
                    symbol: 'none',
                    areaStyle: {
                        color: this.#areaColor(areaColor),
                        ...EChartsDualShadowAreaStyle,
                    },
                    stack: `range_${i}`,
                    z: 2,
                    showInLegend: false,
                });
            });
        }

        if (!useSharedStack) {
            result.forEach((serie, seriesIndex: number) => {
                const lineColor = Color.fromVar(this.getColor(seriesIndex)).toHexString();
                echartsData.push({
                    name: seriesIndex >= this.seriesCount() ? 'Vergleichszeitraum' : CASHFLOW_I18N(serie.name),
                    type: 'line',
                    symbol: 'none',
                    lineStyle: {
                        color: lineColor,
                        width: 2,
                    },
                    data: serie.data.map((_, i: number) => {
                        let y = 0.5 * (_.min + _.max);
                        if (i == serie.data.length - 1 && serie.current) {
                            y = serie.current;
                        }
                        return [_.x, y];
                    }),
                    z: 10 + seriesIndex,
                });
            });
        }

        if (result.length >= 2 && echartsData.length >= 2) {
            const lastPoint1 = result[1]?.data?.at(-1);
            const lastPoint3 = result[3]?.data?.at(-1);
            if (lastPoint1) {
                const current = (lastPoint1.min + lastPoint1.max) / 2;
                const last = lastPoint3 ? (lastPoint3.min + lastPoint3.max) / 2 : 0;
                this.trend.set(current - last);
            }
        }

        if (this.computeTrend() && !useSharedStack) {
            echartsData.forEach((series) => {
                if (series.type === 'line' && (series.data?.length ?? 0) > 10 && series.lineStyle?.color && typeof series.name !== 'number' && !series.name?.includes('Base') && !series.name?.includes('Range')) {
                    const trendData = this.#calculateTrendLine((series.data ?? []) as [string | number, number][]);
                    if (trendData.length > 0) {
                        const trendColor = new Color(series.lineStyle?.color as string).lighten(35).toHexString();
                        echartsData.push({
                            name: `${series.name} Trend`,
                            type: 'line',
                            symbol: 'none',
                            lineStyle: {
                                color: trendColor,
                                width: 1,
                                type: 'dashed',
                            },
                            data: trendData,
                        });
                    }
                }
            });
        }

        this.chartOptions.set({
            ...this.individualOptions(),
            xAxis: {
                type: 'time',
                show: false,
            },
            yAxis: {
                type: 'value',
                min: 0,
                max: maxVal + padding,
                show: false,
            },
            tooltip: {
                trigger: 'axis',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                confine: true,
                formatter: (params: TopLevelFormatterParams) => {
                    const arr = [params].flat();
                    if (arr.length === 0) return '';

                    const dataIndex = arr[0].dataIndex;
                    const xValue = arr[0].axisValue;
                    const headerColor = Color.fromVar(this.getColor(0)).toHexString();

                    const originalSeries = arr.filter((p) => !p.seriesName?.includes('Trend') && !p.seriesName?.includes('Range') && !p.seriesName?.includes('Base'));

                    let html = `<div class="text-center d-flex justify-content-between align-items-center" style="color: ${headerColor}; padding: 4px;">`;
                    html += `<span class="fw-bold">${dayjs(xValue as string).format('YYYY-MM')}</span>`;
                    html += `</div>`;

                    if (useSharedStack && originalSeries.length > 1) {
                        let total = 0;
                        originalSeries.forEach((param, i: number) => {
                            const value = (param.value as number[])[1] ?? (param.value as number);
                            total += value;
                            const seriesColor = Color.fromVar(this.getColor(i)).toHexString();
                            html += `<div class="f-b p-0 hstack gap-2">`;
                            html += `<div class="flex-fill">${param.seriesName}:</div>`;
                            html += `<div class="text-end font-monospace" style="color:${seriesColor};">${this.#formatNumber(value)}${this.suffix()}</div></div>`;
                        });
                        html += `<div class="f-b p-0 hstack gap-2" style="border-top: 1px solid rgba(255,255,255,0.3); margin-top: 4px; padding-top: 4px;">`;
                        html += `<div class="flex-fill">∑:</div>`;
                        html += `<div class="text-end font-monospace" style="color:${headerColor};">${this.#formatNumber(total)}${this.suffix()}</div></div>`;
                    } else {
                        originalSeries.forEach((param) => {
                            const isLast = dataIndex === originalSeries[0]?.dataIndex;
                            const name = isLast ? $localize`:@@i18n.common.current:current` : $localize`:@@i18n.common.average:average`;

                            html += `<div class="f-b p-0 hstack gap-2">`;
                            html += `<div class="flex-fill">${name}:</div>`;
                            html += `<div class="text-end font-monospace" style="color:${headerColor};">${this.#formatNumber((param.value as number[])[1] ?? (param.value as number))}${this.suffix()}</div></div>`;
                        });
                    }
                    return `<div class="arrow_box">${html}</div>`;
                },
            },
            series: echartsData,
        });

        this.echartsInstance()?.setOption(this.chartOptions(), true);
    }

    #calculateTrendLine(data: [string | number, number][]): [string | number, number][] {
        if (data.length < 6) return [];

        let bestMidPoint = Math.floor(data.length / 2);
        let maxDiff = 0;

        for (let mid = Math.floor(data.length * 0.3); mid <= Math.floor(data.length * 0.7); mid++) {
            const firstHalf = data.slice(0, mid);
            const secondHalf = data.slice(mid);

            if (firstHalf.length < 2 || secondHalf.length < 2) continue;

            const firstAvg = firstHalf.reduce((sum, point) => sum + (point[1] || 0), 0) / firstHalf.length;
            const secondAvg = secondHalf.reduce((sum, point) => sum + (point[1] || 0), 0) / secondHalf.length;
            const diff = Math.abs(secondAvg - firstAvg);

            if (diff > maxDiff) {
                maxDiff = diff;
                bestMidPoint = mid;
            }
        }

        const firstHalf = data.slice(0, bestMidPoint);
        const secondHalf = data.slice(bestMidPoint);

        const firstAvg = firstHalf.reduce((sum, point) => sum + (point[1] || 0), 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, point) => sum + (point[1] || 0), 0) / secondHalf.length;

        return [
            [data[0][0], firstAvg],
            [data[bestMidPoint - 1][0], firstAvg],
            [data[bestMidPoint][0], secondAvg],
            [data[data.length - 1][0], secondAvg],
        ];
    }
}
