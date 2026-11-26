import { Dictionary } from '@constants/constants';
import type { ProjectTimelineEntryDto, TimeValuePointDto } from '@models/_core/api-response';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { User } from '@models/user/user.model';
import { Color } from '@constants/Color';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@charts/echarts-presets';
import { injectChartPalette } from '@charts/echarts-theme';

interface TimelineRow {
    user: User;
    data: TimeValuePointDto[];
}
interface WorkloadChart {
    options: Dictionary;
    height: number;
    users: User[];
}

const WORKING_DAYS_PER_CLUSTER: Dictionary<number> = { year: 260, month: 21.67, week: 5, day: 1 };
const MS_PER_DAY = 86_400_000;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'workload-timeline-chart',
    templateUrl: './workload-timeline-chart.component.html',
    imports: [NgxEchartsDirective, AvatarComponent],
})
export class WorkloadTimelineChartComponent {
    #palette = injectChartPalette();
    timeline = input<ProjectTimelineEntryDto[] | undefined>();

    chart = computed<WorkloadChart | null>(() => this.#buildWorkloadChart(this.timeline()));

    #heatmapColor(percentage: number, primary: Color, danger: Color): string {
        if (percentage <= 100) {
            const { r, g, b } = primary.toRgb();
            return `rgba(${r}, ${g}, ${b}, ${percentage / 100})`;
        }
        if (percentage <= 150) {
            const ratio = (percentage - 100) / 50;
            const from = primary.toRgb();
            const to = danger.toRgb();
            const mix = (f: number, t: number) => Math.round(f + (t - f) * ratio);
            return `rgb(${mix(from.r, to.r)}, ${mix(from.g, to.g)}, ${mix(from.b, to.b)})`;
        }
        return danger.toHexString();
    }

    #buildWorkloadChart(timeline?: ProjectTimelineEntryDto[]): WorkloadChart | null {
        timeline ??= [];
        const clusters = [...new Set(timeline.flatMap((entry) => entry.data.map((point) => point.period)))].sort();
        if (!timeline.length || !clusters.length) return null;

        const gapDays = clusters.length >= 2 ? (Date.parse(clusters[1]) - Date.parse(clusters[0])) / MS_PER_DAY : 0;
        const clusterType = gapDays >= 300 ? 'year' : gapDays >= 20 ? 'month' : gapDays >= 5 ? 'week' : 'day';
        const workingDays = WORKING_DAYS_PER_CLUSTER[clusterType];

        const rows: TimelineRow[] = timeline
            .filter((entry) => entry.user)
            .map((entry) => ({ user: User.fromJson(entry.user), data: entry.data }));
        const developers = rows.map((row) => row.user.getName() || 'Unknown');
        const hoursPerCluster = rows.map((row) => {
            const byMonth = new Map(row.data.map((point) => [point.period, Number(point.value) || 0]));
            return clusters.map((cluster) => byMonth.get(cluster) ?? 0);
        });

        const primary = Color.fromVar('primary');
        const danger = Color.fromVar('danger');
        const primaryColor = primary.toHexString();
        const dangerColor = danger.toHexString();
        const bgColor = Color.fromVar('bg1').toHexString();

        const timelineSeries = rows.map((row, index) => ({
            name: developers[index],
            type: 'bar',
            stack: 'total',
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: hoursPerCluster[index],
            itemStyle: { color: row.user.color || primaryColor, opacity: 1, borderWidth: 0 },
            visualMap: false,
        }));

        const heatmapData = rows.flatMap((row, userIdx) =>
            hoursPerCluster[userIdx].map((hoursWorked, dateIdx) => {
                const availableHours = (row.user.getAverageHpd() || 8) * workingDays;
                const percentage = availableHours > 0 ? (hoursWorked / availableHours) * 100 : 0;
                return {
                    value: [dateIdx, userIdx, percentage],
                    itemStyle: { color: this.#heatmapColor(percentage, primary, danger) },
                    meta: {
                        date: clusters[dateIdx],
                        developer: developers[userIdx],
                        hoursWorked,
                        availableHours,
                        percentage,
                        userColor: row.user.color || '#cccccc',
                    },
                };
            }),
        );

        const options: Dictionary = {
            backgroundColor: 'transparent',
            visualMap: {
                min: 0,
                max: 200,
                calculable: false,
                show: false,
                seriesIndex: [timelineSeries.length], // only apply to heatmap (last series)
                inRange: {
                    color: ['transparent', primaryColor, dangerColor],
                },
            },
            grid: [
                { top: 20, height: 120, left: 50, right: 40, containLabel: false },
                { top: 140, bottom: 60, left: 50, right: 40, containLabel: false, height: developers.length * 20 },
            ],
            xAxis: [
                { type: 'category', data: clusters, gridIndex: 0, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: false } },
                { type: 'category', data: clusters, gridIndex: 1, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: false } },
            ],
            yAxis: [
                { type: 'value', gridIndex: 0, min: 0, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
                { type: 'category', data: developers, gridIndex: 1, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { show: false }, splitLine: { show: true, lineStyle: { color: this.#palette().splitLine } } },
            ],
            series: [
                ...timelineSeries,
                {
                    name: 'Capacity',
                    type: 'heatmap',
                    data: heatmapData,
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    label: { show: false },
                    emphasis: { itemStyle: { borderColor: primaryColor, borderWidth: 2 } },
                    itemStyle: { borderWidth: 1, borderColor: bgColor },
                    tooltip: { trigger: 'item' },
                    progressive: 1000,
                    animation: true,
                },
            ],
            tooltip: {
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                trigger: 'axis',
                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                borderColor: primaryColor,
                borderWidth: 1,
                textStyle: {
                    color: '#fff',
                    fontSize: 12,
                },
                axisPointer: {
                    type: 'shadow',
                    shadowStyle: {
                        color: 'rgba(59, 130, 246, 0.1)',
                    },
                },
                formatter: (params: {seriesType: string; value:number, seriesName:string, color: string, name:string, data: Dictionary}[]) => {
                    const paramsArr = [params].flat();

                    const firstParam = paramsArr[0];
                    if (firstParam.seriesType === 'heatmap') {
                        const { developer, date, hoursWorked, availableHours, percentage, userColor } = firstParam['data']['meta'] as Dictionary;
                        return `<div style="padding: 5px;">
                            <div style="font-weight: bold; color: ${userColor};">${developer}</div>
                            <div style="color: #999; font-size: 10px; margin-bottom: 5px;">${date}</div>
                            <div>Worked: <strong>${(hoursWorked as number).toFixed(1)}h</strong></div>
                            <div>Available: <strong>${(availableHours as number).toFixed(1)}h</strong></div>
                            <div style="font-weight: bold; font-size: 1.1em; color: ${userColor}; margin-top: 5px;">${(percentage as number).toFixed(1)}%</div>
                        </div>`;
                    }

                    const barParams = paramsArr.filter(p => p.seriesType === 'bar' && p.value > 0);
                    if (!barParams.length) return '';

                    const total = barParams.reduce((sum: number, p) => sum + p.value, 0);
                    let html = `<div style="padding: 5px;">
                        <div style="font-weight: bold; margin-bottom: 5px;">${barParams[0].name}</div>
                        <div style="border-bottom: 1px solid #444; margin-bottom: 5px; padding-bottom: 3px;">
                            Total: <strong>${total.toFixed(1)}h</strong>
                        </div>`;

                    barParams.forEach((p) => {
                        const val = p.value;
                        const percentage = total > 0 ? ((val / total) * 100).toFixed(0) : 0;
                        html += `<div style="display: flex; align-items: center; margin: 3px 0;">
                            <span style="width: 10px; height: 10px; background: ${p.color}; display: inline-block; margin-right: 5px; border-radius: 2px;"></span>
                            <span style="flex: 1;">${p.seriesName}</span>
                            <strong style="margin-left: 10px;">${val.toFixed(1)}h</strong>
                            <span style="color: #999; margin-left: 5px; font-size: 10px;">(${percentage}%)</span>
                        </div>`;
                    });
                    return html + '</div>';
                },
            },
            legend: {
                show: false,
            },
        };

        return {
            options,
            height: 160 + developers.length * 20,
            users: rows.map((row) => row.user).reverse(),
        };
    }
}
