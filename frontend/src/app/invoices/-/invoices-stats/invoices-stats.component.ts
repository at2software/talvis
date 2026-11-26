import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { EchartsComponent } from '@charts/echarts-wrapper/echarts-wrapper.component';
import { SankeyChartComponent } from '@charts/sankey-chart/sankey-chart.component';
import { RevenueSpiralChartComponent } from '@charts/revenue-spiral-chart/revenue-spiral-chart.component';
import { CustomerRevenueBubbleChartComponent } from './customer-revenue-bubble-chart.component';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@charts/echarts-presets';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { Color } from '@constants/Color';
import { WidgetCashflowComponent } from '@dashboard/widgets/widget-cashflow/widget-cashflow.component';
import { WidgetRevenueCurrentYearComponent } from '@dashboard/widgets/widget-revenue-current-year/widget-revenue-current-year.component';
import { WidgetRevenueRadialComponent } from '@dashboard/widgets/widget-revenue-radial/widget-revenue-radial.component';
import { StatsService } from '@models/stats.service';
import { InvoiceService } from '@models/invoice/invoice.service';
import { MarketingService } from '@models/marketing/marketing.service';
import { MoneyPipe } from '@pipes/money.pipe';
import { ShortPipe } from '@pipes/short.pipe';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import type { EChartsOption } from 'echarts';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { injectChartPalette } from '@charts/echarts-theme';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'invoices-stats',
    templateUrl: './invoices-stats.component.html',
    imports: [FormsModule, NgbTooltipModule, WidgetCashflowComponent, WidgetRevenueCurrentYearComponent, WidgetRevenueRadialComponent, EchartsComponent, SankeyChartComponent, RevenueSpiralChartComponent, CustomerRevenueBubbleChartComponent],
})
export class InvoicesStatsComponent {
    funnelMode = signal<'count' | 'money'>('count');
    spiralSmoothing = signal(3);

    #service = inject(StatsService);
    #invoiceService = inject(InvoiceService);
    #marketingService = inject(MarketingService);
    #palette = injectChartPalette();
    readonly #shortPipe = new ShortPipe();
    readonly #moneyPipe = new MoneyPipe();

    readonly funnelData = modelResource(() => this.#marketingService.getFunnel()).value;
    readonly spiralRevenueData = modelListResource(() => this.#invoiceService.getMonthlySpiralRevenue()).value;
    readonly customerScatterData = modelResource(() => this.#service.getCustomerRevenueScatter()).value;

    readonly #invoiceOverall = modelResource(() => this.#service.showInvoiceOverall());

    readonly overallChart = computed<EChartsOption | undefined>(() => {
        const response = this.#invoiceOverall.value();
        if (!response?.current?.length) return undefined;
        const maxVal = Math.max(...response.current.map((_) => _.sum));
        const primaryColor = Color.fromVar('primary').toHexString();
        const palette = this.#palette();
        return {
            chart: { height: 150 },
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 0, right: 0, top: 10, bottom: 0, containLabel: false },
            xAxis: { type: 'time', show: false },
            yAxis: { type: 'value', show: false },
            tooltip: {
                trigger: 'axis',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: (params) =>
                    (params as CallbackDataParams[])
                        .map((p) => {
                            const [ts, sum] = p.value as [number, number];
                            return `${new Date(ts).getFullYear()}: ${this.#moneyPipe.transform(sum)}`;
                        })
                        .join('<br>'),
            },
            series: [
                {
                    name: 'current',
                    type: 'bar',
                    data: response.current.map((s) => [s.year, s.sum]),
                    itemStyle: { color: primaryColor },
                    markLine: {
                        silent: true,
                        symbol: 'none',
                        data: [{ yAxis: maxVal, name: this.#shortPipe.transform(maxVal), lineStyle: { color: palette.annotation, type: 'dashed', width: 1 }, label: { show: true, formatter: '{b}', position: 'insideEndTop', color: palette.annotation, fontSize: 10 } }],
                    },
                },
            ],
        };
    });

    toggleFunnelMode = () => this.funnelMode.update((m) => (m === 'count' ? 'money' : 'count'));
}
