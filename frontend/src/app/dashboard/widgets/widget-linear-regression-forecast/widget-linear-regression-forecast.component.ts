import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { StatsService } from '@models/stats.service';
import { BaseWidgetComponent } from '../base.widget.component';
import { EChartsRangeAreaOptions, EChartsDualShadowAreaStyle } from '@charts/echarts-presets';
import { Color } from '@constants/Color';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { dayjs } from '@constants/date/dates';
import { WIDGET_SHARED } from '../widgets.shared';
import type { EChartsOption } from 'echarts';
import type { EChartsType, TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { LinearRegressionDataDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-linear-regression-forecast',
    templateUrl: './widget-linear-regression-forecast.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    providers: [MoneyShortPipe],
    imports: [ValueUnitComponent, ...WIDGET_SHARED],
})
export class WidgetLinearRegressionForecastComponent extends BaseWidgetComponent {
    #stats = inject(StatsService);
    #moneyPipe = inject(MoneyShortPipe);
    #echartsInstance: EChartsType | undefined;

    defaultOptions = () => ({});

    readonly #forecast = this.optionsResource(() => this.#stats.showLinearRegressionForecast());
    readonly data = computed<LinearRegressionDataDto | null>(() => this.#forecast.value() ?? null);

    readonly chartOptions = computed<EChartsOption>(() => {
        const data = this.data();
        if (!data) return { ...EChartsRangeAreaOptions, series: [] };

        const sorted = [...data.historical_data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const categories = sorted.map((item) => dayjs(item.date).valueOf());
        const forecasts = sorted.map((item) => item.forecast);
        const expenses = sorted.map((item) => item.annual_expenses ?? null);
        const revenue_12 = sorted.map((item) => item.revenue_12 ?? null);

        const ci99 = sorted.map((item) => this.#ci(item.forecast, item.standard_error, 99));
        const ci95 = sorted.map((item) => this.#ci(item.forecast, item.standard_error, 95));
        const ci68 = sorted.map((item) => this.#ci(item.forecast, item.standard_error, 68));

        const yMax = (this.#median(ci99.map((c) => c.upper)) ?? 0) * 1.2;
        const row = (label: string, cls: string, value: string) =>
            `<div class="hstack gap-2"><span class="font-monospace ${cls}">${label}:</span><span class="ms-auto font-monospace">${value}</span></div>`;

        return ({
            ...EChartsRangeAreaOptions,
            yAxis: { ...EChartsRangeAreaOptions.yAxis, min: 0, max: yMax },
            tooltip: {
                ...EChartsRangeAreaOptions.tooltip,
                formatter: (params: TopLevelFormatterParams) => {
                    const arr = [params].flat();
                    if (!arr?.length) return '';
                    const i = arr[0].dataIndex!;
                    const forecast = forecasts[i];
                    const { standard_error: se, r2 } = sorted[i];
                    const revenue = revenue_12[i];
                    const deviation = revenue ? Math.abs(revenue / forecast - 1) * 100 : 0;
                    return `<div class="p-2">
                        <div class="fw-bold mb-1">${dayjs(categories[i]).format('YYYY-MM')}</div>
                        ${row('Forecast', 'text-white fw-bold', this.#moneyPipe.transform(forecast))}
                        ${row('R²', 'text-muted', `${(r2 * 100).toFixed(1)}%`)}
                        ${row('Std. Error', 'text-muted', this.#moneyPipe.transform(se))}
                        ${row('Expenses', 'text-yellow', this.#moneyPipe.transform(expenses[i]))}
                        ${revenue ? row(`reality (Δ ${deviation.toFixed(1)}%)`, 'text-primary', this.#moneyPipe.transform(revenue)) : ''}
                    </div>`;
                },
            },
            series: [
                ...this.#confidenceBand('confidence99', ci99, categories, 35, 0.3, 1),
                ...this.#confidenceBand('confidence95', ci95, categories, 30, 0.4, 3),
                ...this.#confidenceBand('confidence68', ci68, categories, 25, 0.5, 5),
                { name: 'Forecast', type: 'line', symbol: 'none', z: 10, lineStyle: { color: Color.fromVar('primary').darken(20).toHexString(), width: 2 }, data: forecasts.map((f, i) => [categories[i], f]) },
                { name: 'Expenses', type: 'line', symbol: 'none', z: 11, lineStyle: { color: Color.fromVar('red').toHexString(), width: 2, type: 'dashed' }, data: expenses.map((v, i) => [categories[i], v]) },
                { name: 'real Revenue', type: 'line', symbol: 'none', zlevel: 1, z: 12, lineStyle: { color: '#ffffff', width: 2 }, data: revenue_12.map((v, i) => [categories[i], v]) },
            ],
        } as EChartsOption);
    });

    constructor() {
        super();
        effect(() => this.#echartsInstance?.setOption(this.chartOptions(), true));
    }

    #median(numbers: number[]): number | null {
        if (!numbers.length) return null;
        const sorted = [...numbers].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    }

    #ci(forecast: number, se: number, level: number) {
        const z: Record<number, number> = { 68: 1.0, 95: 1.96, 99: 2.58 };
        const margin = (z[level] ?? 1.96) * se;
        return { lower: forecast - margin, upper: forecast + margin };
    }

    #confidenceBand(label: string, ci: { lower: number; upper: number }[], categories: number[], darken: number, opacity: number, z: number) {
        return [
            { name: `${label} Lower`, type: 'line', symbol: 'none', data: ci.map(({ lower }, i) => [categories[i], lower]), lineStyle: { opacity: 0 }, stack: label, z },
            { name: label, type: 'line', symbol: 'none', data: ci.map(({ lower, upper }, i) => [categories[i], upper - lower]), lineStyle: { opacity: 0 }, areaStyle: { color: Color.fromVar('primary').darken(darken).toHexString(), opacity, ...EChartsDualShadowAreaStyle }, stack: label, z: z + 1 },
        ];
    }

    onChartInit = (ec: EChartsType) => (this.#echartsInstance = ec);
}
