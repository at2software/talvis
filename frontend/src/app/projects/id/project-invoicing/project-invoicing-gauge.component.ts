import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import { injectChartPalette } from '@charts/echarts-theme';

export interface ProbabilityCurvePoint {
    x: number;
    y: number;
}

@Component({
    selector: 'project-invoicing-gauge',
    imports: [NgxEchartsDirective],
    template: `<div echarts [options]="options()" style="height: 200px; margin-top: -55px;"></div>`,
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectInvoicingGaugeComponent {
    #palette = injectChartPalette();
    net = input<number>(0);
    budgetCurve = input<ProbabilityCurvePoint[]>([]);
    timeMult = input<number>(1);
    customerRate = input<number | null | undefined>(null);

    options = computed(() => {
        const { prob, budgetProb, timeMult } = this.#computeProbability();
        const rate = this.customerRate();
        const net = this.net();
        const palette = this.#palette();

        const rejectionRate = rate != null ? Math.max(0.001, 1 - rate) : null;
        const colorStops: [number, string][] =
            rejectionRate != null
                ? [
                      [rejectionRate, 'rgba(60,65,80,0.7)'],
                      [1, '#28c76f'],
                  ]
                : [[1, palette.ink(0.2)]];

        const rateLabel = rate != null ? `${Math.round(rate * 100)}%` : 'no data';
        const rejLabel = rejectionRate != null ? `${Math.round(rejectionRate * 100)}%` : 'no data';
        const netFmt = net >= 1000 ? `€${(net / 1000).toFixed(0)}k` : `€${net}`;
        const dot = (color: string) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;flex-shrink:0"></span>`;

        return {
            backgroundColor: 'transparent',
            animation: false,
            tooltip: {
                show: true,
                appendToBody: true,
                backgroundColor: 'rgba(30,30,40,0.95)',
                borderColor: 'rgba(255,255,255,0.1)',
                borderWidth: 1,
                textStyle: { color: '#dee2e6', fontSize: 12 },
                formatter: () => {
                    const hasData = this.budgetCurve().length > 0;
                    const computeSection = hasData ? `<div style="margin-bottom:8px">` + `<div style="color:#adb5bd;font-size:10px;letter-spacing:.05em;margin-bottom:4px">HOW IT'S COMPUTED</div>` + `<div style="display:flex;justify-content:space-between;gap:16px">` + `<span style="color:#adb5bd">budget (${netFmt})</span><span>${Math.round(budgetProb * 100)}%</span></div>` + `<div style="display:flex;justify-content:space-between;gap:16px">` + `<span style="color:#adb5bd">time factor</span><span>×${timeMult.toFixed(2)}</span></div>` + `<div style="display:flex;justify-content:space-between;gap:16px;border-top:1px solid rgba(255,255,255,0.08);margin-top:4px;padding-top:4px">` + `<span style="color:#adb5bd">lead probability</span><b>${Math.round(prob * 100)}%</b></div>` + `</div>` : `<div style="color:#adb5bd;font-size:11px;margin-bottom:8px">no curve data available</div>`;

                    const bandSection = rate != null ? `<div>` + `<div style="color:#adb5bd;font-size:10px;letter-spacing:.05em;margin-bottom:4px">CUSTOMER PURCHASING BEHAVIOUR</div>` + `<div style="display:flex;align-items:center;margin-bottom:2px">${dot('rgba(60,65,80,0.9)')}` + `<span>0 – ${rejLabel} &nbsp;<span style="color:#adb5bd;font-size:11px">typical rejection zone</span></span></div>` + `<div style="display:flex;align-items:center">${dot('#28c76f')}` + `<span>${rejLabel} – 100% &nbsp;<span style="color:#adb5bd;font-size:11px">typical acceptance zone</span></span></div>` + `<div style="color:#adb5bd;font-size:11px;margin-top:4px">${rateLabel} of quotes accepted by this customer</div>` + `</div>` : `<div style="color:#adb5bd;font-size:11px">no customer acceptance data</div>`;

                    return `<div style="line-height:1.6;min-width:220px">${computeSection}<div style="border-top:1px solid rgba(255,255,255,0.12);margin:6px 0"></div>${bandSection}</div>`;
                },
            },
            series: [
                {
                    type: 'gauge',
                    startAngle: 180,
                    endAngle: 0,
                    radius: '96%',
                    center: ['50%', '78%'],
                    min: 0,
                    max: 1,
                    data: [{ value: prob }],
                    axisLine: {
                        lineStyle: { width: 10, color: colorStops },
                    },
                    pointer: {
                        show: true,
                        length: '78%',
                        width: 3,
                        itemStyle: { color: palette.text },
                    },
                    anchor: {
                        show: true,
                        size: 8,
                        itemStyle: { color: palette.text, borderWidth: 0 },
                    },
                    axisTick: { show: false },
                    splitLine: { show: false },
                    axisLabel: { show: false },
                    detail: {
                        valueAnimation: false,
                        formatter: (v: number) => `${Math.round(v * 100)}%`,
                        color: palette.dark ? '#dee2e6' : palette.text,
                        fontSize: 13,
                        offsetCenter: [0, '-18%'],
                    },
                    title: { show: false },
                },
            ],
        };
    });

    #computeProbability(): { prob: number; budgetProb: number; timeMult: number } {
        const curve = this.budgetCurve();
        const timeMult = this.timeMult();
        if (!curve.length) return { prob: 0, budgetProb: 0, timeMult };

        const budgetProb = this.#findYBelowThreshold(curve, this.net()) ?? curve[0].y;
        const prob = Math.max(0, Math.min(1, timeMult * budgetProb));
        return { prob, budgetProb, timeMult };
    }

    #findYBelowThreshold(curve: ProbabilityCurvePoint[], threshold: number): number | null {
        let lo = 0,
            hi = curve.length - 1,
            result: number | null = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (curve[mid].x < threshold) {
                result = curve[mid].y;
                lo = mid + 1;
            } else hi = mid - 1;
        }
        return result;
    }
}
