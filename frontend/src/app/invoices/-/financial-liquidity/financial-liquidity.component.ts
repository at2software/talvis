import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { InvoiceService } from '@models/invoice/invoice.service';
import { MoneyPipe } from '@pipes/money.pipe';
import { ShortPipe } from '@pipes/short.pipe';
import { DatePipe, NgClass } from '@angular/common';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@app/_charts/echarts-presets';
import type { EChartsOption } from 'echarts';
import { Color } from '@constants/Color';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { LiquidityEventDto } from '@models/_core/api-response';
import { modelResource } from '@models/http/model-resource';
import { StackedTableDirective } from '@directives/stacked-table.directive';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface DayGroup {
    date: string;
    events: LiquidityEventDto[];
    totalAmount: number;
    balanceAfter: number;
}

const fmt = (v: number) => ShortPipe.shorten(v);

const TYPE_CONFIG: Dictionary<{ label: string; badge: string }> = {
    expense:        { label: $localize`:@@i18n.invoices.expense:Expense`,               badge: 'text-bg-danger'  },
    standing_order: { label: $localize`:@@i18n.invoices.standingOrder:Standing order`,  badge: 'text-bg-warning' },
    open_invoice:   { label: $localize`:@@i18n.invoices.openInvoice:Open invoice`,      badge: 'text-bg-info'    },
    budget_project: { label: $localize`:@@i18n.invoices.budgetProject:Budget project`,  badge: 'text-bg-success' },
    support:        { label: $localize`:@@i18n.common.support:Support`,                 badge: 'text-bg-primary' },
    downpayment:    { label: $localize`:@@i18n.invoices.downpayment:Downpayment`,       badge: 'text-bg-success' },
};

@Component({
    selector: 'financial-liquidity',
    templateUrl: './financial-liquidity.component.html',
    styleUrls: ['./financial-liquidity.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [StackedTableDirective, NgxEchartsDirective, MoneyPipe, DatePipe, NgClass, NgbTooltipModule, SpinnerComponent],
})
export class FinancialLiquidityComponent {
    readonly #invoiceService = inject(InvoiceService);

    readonly #liquidity = modelResource(() => this.#invoiceService.getLiquidity());

    isLoading      = this.#liquidity.isLoading;
    balance        = computed(() => this.#liquidity.value()?.balance ?? 0);
    events         = computed(() => this.#liquidity.value()?.events ?? []);
    chartOptions   = computed<EChartsOption>(() => this.#buildChartOptions(this.balance(), this.events()));
    zeroDate       = computed(() => this.#findZeroDate(this.events()));
    expandedDates  = signal(new Set<string>());

    readonly groupedEvents = computed<DayGroup[]>(() => {
        const map = new Map<string, LiquidityEventDto[]>();
        for (const e of this.events()) {
            if (!map.has(e.date)) map.set(e.date, []);
            map.get(e.date)!.push(e);
        }
        return Array.from(map.entries()).map(([date, evs]) => ({
            date,
            events: evs,
            totalAmount:  evs.reduce((s, e) => s + e.amount, 0),
            balanceAfter: evs[evs.length - 1].balance_after,
        }));
    });

    #findZeroDate(events: LiquidityEventDto[]): { date: string; daysUntil: number } | null {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const e of events) {
            if (e.balance_after < 0) {
                const d = new Date(e.date);
                const daysUntil = Math.round((d.getTime() - today.getTime()) / 86_400_000);
                return { date: e.date, daysUntil };
            }
        }
        return null;
    }

    toggleDay(date: string) {
        this.expandedDates.update(s => {
            const next = new Set(s);
            if (next.has(date)) next.delete(date); else next.add(date);
            return next;
        });
    }

    isExpanded = (date: string) => this.expandedDates().has(date);

    typeLabel  = (type: string) => TYPE_CONFIG[type]?.label ?? type;
    typeBadge  = (type: string) => TYPE_CONFIG[type]?.badge ?? 'text-bg-primary';
    isInflow   = (amount: number) => amount > 0;

    eventTooltip = (event: LiquidityEventDto): string => {
        const fmt = (d: string) => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        switch (event.type) {
            case 'expense':
                return `Will be deducted on ${fmt(event.date)}`;
            case 'open_invoice':
                return `Invoiced on ${fmt(event.invoice_date ?? event.date)} – assumed payment duration of ${event.payment_days ?? 0} days`;
            case 'budget_project':
                return `Assumed finalization and invoicing on ${fmt(event.invoice_date ?? event.date)} and payment duration of ${event.payment_days ?? 0} days`;
            case 'support':
                return `Assumed invoicing on ${fmt(event.invoice_date ?? event.date)} and payment duration of ${event.payment_days ?? 0} days`;
            default:
                return '';
        }
    };
    typeGroups = (events: LiquidityEventDto[]) => {
        const map = new Map<string, number>();
        for (const e of events) map.set(e.type, (map.get(e.type) ?? 0) + 1);
        return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
    };

    #buildChartOptions(startBalance: number, events: LiquidityEventDto[]): EChartsOption {
        const primaryColor = Color.fromVar('primary').toHexString();
        const dangerColor  = Color.fromVar('danger').toHexString();

        const days: string[]                               = [];
        const candleData: [number, number, number, number][] = [];
        const now      = new Date();
        let   balance  = startBalance;

        for (let i = 0; i < 365; i++) {
            const d       = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
            const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            const open = balance;
            let high   = balance;
            let low    = balance;

            for (const e of events.filter(ev => ev.date === dateKey)) {
                balance = e.balance_after;
                if (balance > high) high = balance;
                if (balance < low)  low  = balance;
            }

            candleData.push([open, balance, low, high]);
            days.push(dateKey);
        }

        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                formatter: (params) => {
                    const p = (Array.isArray(params) ? params[0] : params) as { data?: unknown; value?: unknown; name?: string };
                    const raw = p?.data ?? p?.value;
                    if (!raw) return '';
                    const [open, close, low, high] = raw as number[];
                    const diff  = close - open;
                    const color = diff >= 0 ? primaryColor : dangerColor;
                    const sign  = diff >= 0 ? '+' : '';
                    return `<div class="arrow_box">
                        <div class="card-header text-center" style="background:${color};padding:4px 8px">${p.name}</div>
                        <div class="card-body p-2" style="min-width:160px">
                            <div class="d-flex justify-content-between gap-3"><span class="text-muted">Open</span><span>${fmt(open)}</span></div>
                            <div class="d-flex justify-content-between gap-3"><span class="text-muted">Close</span><strong>${fmt(close)}</strong></div>
                            <div class="d-flex justify-content-between gap-3"><span class="text-muted">High</span><span>${fmt(high)}</span></div>
                            <div class="d-flex justify-content-between gap-3"><span class="text-muted">Low</span><span>${fmt(low)}</span></div>
                            <hr class="my-1">
                            <div class="d-flex justify-content-between gap-3" style="color:${color}"><span>Change</span><strong>${sign}${fmt(diff)}</strong></div>
                        </div>
                    </div>`;
                },
            },
            dataZoom: [
                { type: 'inside', start: 0, end: 25 },
                { type: 'slider', start: 0, end: 25, height: 20, bottom: 4, borderColor: 'transparent', fillerColor: primaryColor + '33', handleStyle: { color: primaryColor } },
            ],
            grid: { left: 60, right: 20, top: 20, bottom: 50 },
            xAxis: {
                type: 'category',
                data: days,
                axisLine: { lineStyle: { color: '#ffffff22' } },
                axisTick: { show: false },
                axisLabel: {
                    color: '#ffffff99',
                    formatter: (value: string) => {
                        const d = new Date(value);
                        return d.getDate() === 1
                            ? d.toLocaleString('default', { month: 'short' })
                            : String(d.getDate());
                    },
                },
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#ffffff11' } },
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { color: '#ffffff99', formatter: (v: number) => fmt(v) },
            },
            series: [{
                type: 'candlestick',
                data: candleData,
                itemStyle: {
                    color:        primaryColor,
                    color0:       dangerColor,
                    borderColor:  primaryColor,
                    borderColor0: dangerColor,
                },
            }],
        };
    }
}
