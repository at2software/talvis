import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { Company } from '@models/company/company.model';
import { InvoiceService } from '@models/invoice/invoice.service';
import { StatsService } from '@models/stats.service';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS, ECHARTS_DONUT_CENTER_TEXT, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES_LABELED, ECHARTS_DONUT_TRACK_COLOR } from '@charts/echarts-presets';
import { Color } from '@constants/Color';
import { GlobalService } from '@models/global.service';
import { dayjs } from '@constants/date/dates';
import { DecimalPipe, PercentPipe, DatePipe } from '@angular/common';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { EchartsComponent } from '@charts/echarts-wrapper/echarts-wrapper.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { CustomerRevenueBubbleChartComponent } from '@app/invoices/-/invoices-stats/customer-revenue-bubble-chart.component';
import { WidgetCustomerChurnComponent } from '@dashboard/widgets/widget-customer-churn/widget-customer-churn.component';
import { Nx } from '@app/nx/nx.directive';
import { modelResource } from '@models/http/model-resource';
import { map } from 'rxjs';
import type { EChartsOption } from 'echarts';

const BREAKPOINT_PERC = 0.025;
const BREAKPOINT_REV = 1000;

interface ScatterplotOptions {
    yAxisType?: 'value' | 'log' | 'time' | 'category';
    yMin?: number;
    yMax?: number;
    yMarkLines?: { yAxis: number; color: string }[];
    tooltipFormatter?: (params: unknown) => string;
}
@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customers-statistics',
    templateUrl: './customers-statistics.component.html',
    styleUrls: ['./customers-statistics.component.scss'],
    imports: [DecimalPipe, PercentPipe, DatePipe, AvatarComponent, EchartsComponent, NgbTooltipModule, EmptyStateComponent, SpinnerComponent, CustomerRevenueBubbleChartComponent, WidgetCustomerChurnComponent, Nx],
})
export class CustomersStatisticsComponent {
    invoiceService = inject(InvoiceService);
    global = inject(GlobalService);
    #statsService = inject(StatsService);

    readonly #scatter = modelResource(() => this.#statsService.getCustomerRevenueScatter());
    readonly customerScatterData = this.#scatter.value;

    readonly #stats = modelResource(() => this.invoiceService.getCustomerStats().pipe(map((_) => ({ ..._, companies: _.companies?.map(this.convertToCompany) }))));
    readonly isLoading = this.#stats.isLoading;

    readonly #companies = computed<Company[] | undefined>(() => this.#stats.value()?.companies);
    readonly #totalLastYear = computed(() => Number(this.#stats.value()?.total_last_year ?? 0));

    readonly premiumCustomers = computed<Company[] | undefined>(() => this.#companies()?.filter((_) => _.revenue_last_1_year >= BREAKPOINT_PERC * this.#totalLastYear()));
    readonly #restCompanies = computed<Company[]>(() => this.#companies()?.filter((_) => _.revenue_last_1_year < BREAKPOINT_PERC * this.#totalLastYear()) ?? []);
    readonly #revCompanies = computed<Company[]>(() => this.#companies()?.filter((_) => _.revenue_last_1_year > BREAKPOINT_REV) ?? []);

    readonly #symbolMap = resource({
        params: () => this.#revCompanies(),
        loader: ({ params }) => this.#buildSymbolMap(params),
        defaultValue: new Map<string, string>(),
    });

    readonly #eur = (val: number) => (val ? `${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` + this.global.currencySymbol() : '');

    readonly pieOptions = computed<EChartsOption | undefined>(() => {
        const premium = this.premiumCustomers();
        if (!premium) return undefined;

        const rest = this.#restCompanies();
        const reduced: { id: string; name: string; value: number }[] = [
            ...premium.map((_) => ({ id: _.id, name: _.getName(), value: _.revenue_last_1_year })),
            ...(rest.length ? [{ id: '0', name: $localize`:@@i18n.common.rest:rest`, value: rest.reduce((a, b) => a + b.revenue_last_1_year, 0) }] : []),
        ];
        const total = reduced.reduce((s, c) => s + (c.value ?? 0), 0);

        return {
            chart: { height: 300 },
            backgroundColor: 'transparent',
            animation: false,
            tooltip: {
                trigger: 'item',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: (rawParams: unknown) => {
                    const params = rawParams as { name: string; value: number };
                    return `${params.name}: ${this.#eur(params.value)}`;
                },
            },
            graphic: [{ type: 'text', left: 'center', top: 'center', style: { ...ECHARTS_DONUT_CENTER_TEXT, text: this.#eur(total), fontSize: 12 } }],
            series: [
                {
                    type: 'pie',
                    radius: ECHARTS_DONUT_SERIES_LABELED.radius,
                    data: reduced.map((_) => ({
                        value: _.value,
                        name: _.name,
                        itemStyle: { color: _.id !== '0' ? Color.uniqueColorFromString('' + _.id) : ECHARTS_DONUT_TRACK_COLOR, ...ECHARTS_DONUT_ITEM_STYLE },
                    })),
                    label: { show: true, formatter: (rawP: unknown) => {
                        const p = rawP as { name: string; percent?: number };
                        return `${p.name}\n${p.percent?.toFixed(1)}%`;
                    }, color: '#ffffff', fontSize: 11 },
                },
            ],
        };
    });

    readonly wageOptions = computed<EChartsOption | undefined>(() => {
        if (!this.#companies()) return undefined;
        const hourlyWage = this.global.setting('INVOICE_HOURLY_WAGE');
        const wageRed = 0.5 * hourlyWage;
        const wagePadding = ((hourlyWage - wageRed) / 0.7) * 0.15;
        const yMin = wageRed - wagePadding;
        const yMax = hourlyWage + wagePadding;
        return this.getScatterplot(
            this.#revCompanies(),
            (_) => _.var.log,
            (_) => Math.min(yMax, Math.max(yMin, _.revenue_total / (_.total_time ?? 0))),
            (_) => _.revenue_total,
            'hourly wage',
            {
                yMin,
                yMax,
                yMarkLines: [
                    { yAxis: hourlyWage, color: Color.fromVar('--bs-green', '').darken(5).toHexString() },
                    { yAxis: 0.833 * hourlyWage, color: Color.fromVar('--bs-yellow', '').darken(5).toHexString() },
                    { yAxis: 0.666 * hourlyWage, color: Color.fromVar('--bs-orange', '').darken(5).toHexString() },
                    { yAxis: wageRed, color: Color.fromVar('--bs-red', '').darken(5).toHexString() },
                ],
                tooltipFormatter: (rawParams: unknown) => {
                    const params = rawParams as { seriesName: string; value: [number, number, number] };
                    return `${params.seriesName}<br/>${this.#eur(params.value[0])}<br/>wage: ${this.#eur(params.value[1])}<br/>total: ${this.#eur(params.value[2])}`;
                },
            },
            262,
            this.#symbolMap.value(),
        );
    });

    readonly bcgOptions = computed<EChartsOption | undefined>(() => {
        if (!this.#companies()) return undefined;
        return this.getScatterplot(
            this.#revCompanies(),
            (_) => _.var.log,
            (_) => _.var.trend * 100 + 101,
            (_) => _.revenue_total,
            'trend',
            {
                yAxisType: 'log',
                yMarkLines: [{ yAxis: 101, color: '#555555' }],
                tooltipFormatter: (rawParams: unknown) => {
                    const params = rawParams as { seriesName: string; value: [number, number, number] };
                    return `${params.seriesName}<br/>trend: ${(params.value[1] - 101).toFixed(2)}%<br/>revenue: ${this.#eur(params.value[2])}`;
                },
            },
            500,
            this.#symbolMap.value(),
        );
    });

    convertToCompany(_: Company) {
        const n = Company.fromJson(_);
        n.revenue_total = Number(n.revenue_total) || 0;
        n.var.log = Math.log10(Math.max(n.revenue_last_1_year, 1));
        n.var.customer_since = Math.max(dayjs().diff(n.earliest_invoice?.created_at, 'year'), 1);
        n.var.trend = (n.revenue_last_1_year * n.var.customer_since) / (n.revenue_total || 1) - 1;
        return n;
    }

    getScatterplot(companies: Company[], fnX: (_: Company) => number, fnY: (_: Company) => number, fnZ: (_: Company) => number, _name: string, options: ScatterplotOptions = {}, height: number = 300, symbolMap = new Map<string, string>()): EChartsOption {
        return {
            chart: { height },
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 0, right: 0, top: 0, bottom: 0 },
            xAxis: { type: 'value', show: false, scale: true },
            yAxis: { type: options.yAxisType ?? 'value', show: false, ...(options.yAxisType === 'log' ? { logBase: Math.E } : {}), ...(options.yMin !== undefined ? { min: options.yMin } : {}), ...(options.yMax !== undefined ? { max: options.yMax } : {}) },
            tooltip: {
                trigger: 'item',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: options.tooltipFormatter,
            },
            series: companies.map((c) => ({
                name: c.getName(),
                type: 'scatter',
                symbol: symbolMap.get(String(c.id)) ?? `image://${c.getAvatar()}`,
                symbolSize: 24,
                data: [[fnX(c), fnY(c), fnZ(c)]],
                itemStyle: { color: Color.uniqueColorFromString('' + c.id), borderColor: '#666666', borderWidth: 1 },
                ...(options.yMarkLines?.length
                    ? {
                          markLine: {
                              silent: true,
                              symbol: 'none',
                              data: options.yMarkLines.map((m) => ({ yAxis: m.yAxis, lineStyle: { color: m.color, type: 'dashed', width: 2 }, label: { show: false } })),
                          },
                      }
                    : {}),
            })),
        } satisfies EChartsOption;
    }

    async #buildSymbolMap(companies: Company[]): Promise<Map<string, string>> {
        const map = new Map<string, string>();
        await Promise.all(
            companies.map(async (c) => {
                const symbol = await this.#toCircularSymbol(c.getAvatar());
                map.set(String(c.id), symbol);
            }),
        );
        return map;
    }

    #toCircularSymbol(url: string): Promise<string> {
        const size = 24;
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d')!;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                ctx.beginPath();
                ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, 0, 0, size, size);
                resolve(`image://${canvas.toDataURL()}`);
            };
            img.onerror = () => resolve('circle');
            img.src = url;
        });
    }
}
