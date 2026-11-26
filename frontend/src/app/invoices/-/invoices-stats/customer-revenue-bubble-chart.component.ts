import { ChangeDetectionStrategy, Component, effect, input, signal } from '@angular/core';
import { EchartsComponent } from '@charts/echarts-wrapper/echarts-wrapper.component';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@charts/echarts-presets';
import { CustomerRevenueScatterAxesDto, CustomerRevenueScatterDto } from '@models/_core/api-response';
import { MoneyPipe } from '@pipes/money.pipe';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import type { EChartsOption } from 'echarts';
import { injectChartPalette } from '@charts/echarts-theme';

const MIN_SIZE = 6;
const MAX_SIZE = 40;
const FALLBACK_COLOR = '#0d6efd';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customer-revenue-bubble-chart',
    template: `
        <div class="card h-100 mb-3">
            <div class="card-header hstack gap-2">
                <div class="flex-fill">{{ label() }}</div>
                @if (hint()) {
                    <i class="text-muted" style="font-size: 14px" [ngbTooltip]="hint()">info</i>
                }
            </div>
            <div class="card-body p-1">
                <nx-echarts [options]="chartOptions()"></nx-echarts>
            </div>
        </div>
    `,
    imports: [EchartsComponent, NgbTooltipModule],
})
export class CustomerRevenueBubbleChartComponent {
    xAxisKey = input.required<keyof CustomerRevenueScatterAxesDto>();
    label = input.required<string>();
    hint = input<string>('');
    data = input<CustomerRevenueScatterDto | undefined>(undefined);

    chartOptions = signal<EChartsOption | undefined>(undefined);

    readonly #money = new MoneyPipe();
    #palette = injectChartPalette();

    constructor() {
        effect(() => {
            const palette = this.#palette();
            const response = this.data();
            const key = this.xAxisKey();
            const label = this.label();
            const points = response?.points ?? [];

            if (!points.length) {
                this.chartOptions.set(undefined);
                return;
            }

            const maxRevenue = Math.max(...points.map((p) => p.total_revenue));
            const money = this.#money;

            const isLogAxis = key === 'months_since_last';

            const data = points.map((p) => {
                const raw = p.x[key];
                const y = isLogAxis ? Math.max(Math.abs(raw), 0.1) : raw;
                const ratio = p.total_revenue > 0 ? (p.followup_revenue / p.total_revenue) * 100 : 0;
                const size = maxRevenue > 0 ? MIN_SIZE + ((p.total_revenue / maxRevenue) * (MAX_SIZE - MIN_SIZE)) : MIN_SIZE;
                return {
                    value: [ratio, y, p.total_revenue, p.new_revenue, p.followup_revenue],
                    rawY: raw,
                    name: p.name,
                    symbolSize: size,
                    itemStyle: { color: p.initial_group_color || FALLBACK_COLOR, opacity: 0.8 },
                    groupName: p.initial_group_name,
                };
            });

            this.chartOptions.set({
                chart: { height: 180 },
                backgroundColor: 'transparent',
                animation: false,
                grid: { left: 40, right: 12, top: 10, bottom: 22, containLabel: false },
                xAxis: {
                    type: 'value',
                    min: 0,
                    max: 100,
                    name: 'Follow-up %',
                    nameLocation: 'middle',
                    nameGap: 14,
                    nameTextStyle: { color: palette.textMuted, fontSize: 10 },
                    axisLabel: { color: palette.textMuted, fontSize: 9, formatter: '{value}%' },
                    axisLine: { lineStyle: { color: palette.axisLine } },
                    splitLine: { lineStyle: { color: palette.splitLine } },
                },
                yAxis: {
                    type: isLogAxis ? 'log' : 'value',
                    inverse: isLogAxis,
                    axisLabel: { color: palette.textMuted, fontSize: 9 },
                    axisLine: { lineStyle: { color: palette.axisLine } },
                    splitLine: { lineStyle: { color: palette.splitLine } },
                },
                tooltip: {
                    trigger: 'item',
                    ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                    formatter: (params: any) => {
                        const [ratio, , total, newRev, followup] = params.value;
                        const displayY = isLogAxis ? Math.abs(params.data.rawY).toFixed(1) : params.value[1];
                        const group = params.data.groupName;
                        return `<strong>${params.name}</strong>`
                            + (group ? ` <span style="opacity:0.65">${group}</span>` : '')
                            + `<br>${label}: ${displayY}<br>`
                            + `Follow-up / Total: ${ratio.toFixed(1)}%<br>`
                            + `Total: ${money.transform(total)}<br>`
                            + `New: ${money.transform(newRev)}<br>`
                            + `Follow-up: ${money.transform(followup)}`;
                    },
                },
                series: [{ type: 'scatter', data }],
            });
        });
    }
}
