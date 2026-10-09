import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Company } from '@models/company/company.model';
import { CompanyService } from '@models/company/company.service';
import { modelListResource } from '@models/http/model-resource';
import { MonthlyBiasDataDto } from '@models/_core/api-response';
import { NgxEchartsDirective } from 'ngx-echarts';
import { Color } from '@constants/Color';
import { tracked } from '@constants/tracked';
import { EChartsSimpleOptions, ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@charts/echarts-presets';
import { dayjs } from '@constants/date/dates';
import type { EChartsOption } from 'echarts';

@Component({
    selector: 'customer-prediction-bias-chart',
    imports: [NgxEchartsDirective],
    template: `
        @if (hasData()) {
            <div class="card chart-card mb-3">
                <div class="card-header hstack gap-2">
                    <span i18n="@@i18n.widget-prediction-bias" class="flex-fill text-truncate">prediction bias</span>
                </div>
                <div echarts [options]="chartOptions()" [initOpts]="{ height: 100 }" style="height: 100px;"></div>
            </div>
        }
    `,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerPredictionBiasChartComponent {
    static readonly MIN_MONTHS = 3;

    readonly company = input.required<Company>();
    readonly trackedCompany = tracked(this.company);
    readonly #companyService = inject(CompanyService);

    readonly #accuracy = modelListResource(
        () => this.company()?.id || undefined,
        (companyId) => this.#companyService.getPredictionAccuracy(companyId),
    );
    readonly hasData = computed(() => this.#accuracy.value().length >= CustomerPredictionBiasChartComponent.MIN_MONTHS);
    readonly chartOptions = computed<EChartsOption>(() => this.#buildChart(this.#accuracy.value()));

    #buildChart(data: MonthlyBiasDataDto[]): EChartsOption {
        const successColor = Color.fromVar('success').toHexString();
        const dangerColor = Color.fromVar('danger').toHexString();
        const mutedColor = 'rgba(255,255,255,0.15)';

        const dataMap = new Map(data.map((d) => [d.period, d]));
        const months: string[] = [];
        const barData: { value: number | null; itemStyle: { color: string } }[] = [];
        const tooltipData: (MonthlyBiasDataDto | null)[] = [];

        for (let i = 36; i >= 0; i--) {
            const m = dayjs().subtract(i, 'months').format('YYYY-MM');
            months.push(m);
            const d = dataMap.get(m) ?? null;
            if (d) {
                const v = +((1 - d.value) * 100).toFixed(1);
                barData.push({ value: v, itemStyle: { color: v > 0 ? successColor : v < 0 ? dangerColor : mutedColor } });
                tooltipData.push(d);
            } else {
                barData.push({ value: null, itemStyle: { color: mutedColor } });
                tooltipData.push(null);
            }
        }
        return {
            ...EChartsSimpleOptions,
            xAxis: { type: 'category', data: months, show: false },
            yAxis: { type: 'value', show: false },
            tooltip: {
                trigger: 'axis',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: (rawParams: unknown) => {
                    const params = rawParams as { dataIndex: number }[];
                    const i = params[0].dataIndex;
                    const d = tooltipData[i];
                    const m = months[i];
                    if (!d) return `<div class="arrow_box"><div class="text-center d-flex justify-content-between align-items-center" style="padding: 4px;"><span class="fw-bold">${m}</span></div><div class="f-b p-0 hstack gap-2"><div class="flex-fill text-muted">no data</div></div></div>`;
                    const v = +((1 - d.value) * 100).toFixed(1);
                    const color = v > 0 ? successColor : v < 0 ? dangerColor : mutedColor;
                    const sign = v > 0 ? '+' : '';
                    return `<div class="arrow_box"><div class="text-center d-flex justify-content-between align-items-center" style="color: ${color}; padding: 4px;"><span class="fw-bold">${m}</span></div><div class="f-b p-0 hstack gap-2"><div class="flex-fill">bias:</div><div class="text-end font-monospace" style="color:${color};">${sign}${v}%</div></div><div class="f-b p-0 hstack gap-2"><div class="flex-fill">projects:</div><div class="text-end font-monospace">${d.projects_count}</div></div></div>`;
                },
            },
            series: [{
                type: 'bar',
                data: barData,
                markLine: {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: 'rgba(255,255,255,0.2)', type: 'solid', width: 1 },
                    data: [{ yAxis: 0 }],
                    label: { show: false },
                },
            }],
        } satisfies EChartsOption;
    }
}
