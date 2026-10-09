import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { arc, curveCardinalClosed, line, max, range, scaleBand, scaleLinear, select, selectAll } from 'd3';
import { InvoiceService } from '@models/invoice/invoice.service';
import { NComponent } from '@shards/n/n.component';
import { Color } from '@constants/Color';
import { MoneyPipe } from '@pipes/money.pipe';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface MonthlyRevenueData {
    month: number;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    avg: number;
}

interface RadialLayer {
    getInner: (d: MonthlyRevenueData) => number;
    getOuter: (d: MonthlyRevenueData) => number;
    darken: number;
}

interface RadialPoint { x: number; y: number }

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-revenue-radial',
    templateUrl: './widget-revenue-radial.component.html',
    host: { class: 'd-block' },
    imports: [NComponent, SpinnerComponent],
    providers: [MoneyPipe],
})
export class WidgetRevenueRadialComponent {
    private readonly chartContainer = viewChild<ElementRef>('chart');

    #invoiceService = inject(InvoiceService);
    #moneyPipe = inject(MoneyPipe);

    readonly #ranges = modelListResource<MonthlyRevenueData>(() => this.#invoiceService.getMonthlyRevenueRanges());
    readonly loading = this.#ranges.isLoading;
    readonly #data = computed(() => this.#ranges.value());

    constructor() {
        effect(() => this.#data().length && setTimeout(() => this.#createChart()));
    }

    #createChart() {
        if (!this.chartContainer() || !this.#data().length) return;

        select(this.chartContainer()!.nativeElement).selectAll('*').remove();

        const width = 280;
        const height = 280;
        const innerRadius = 50;
        const baseOuterRadius = Math.min(width, height) / 2 - 30;
        const labelRadius = baseOuterRadius + 20;
        const outerRadius = baseOuterRadius * 1.4;

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const x = scaleBand().domain(range(12).map((i) => i.toString())).range([0, 2 * Math.PI]).align(0);
        const maxValue = max(this.#data(), (d) => d.max) || 1;
        const y = scaleLinear().domain([0, maxValue * 1.1]).range([innerRadius, outerRadius]);

        const svg = select(this.chartContainer()!.nativeElement)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `${-width / 2} ${-height / 2} ${width} ${height}`)
            .attr('style', 'max-width: 100%; height: auto;');

        const g = svg.append('g');

        const getBand = (d: MonthlyRevenueData, position: 'min' | 'inner-dark' | 'inner-light' | 'median' | 'outer-light' | 'outer-dark' | 'max'): number => {
            const median = d.median;
            const lowerRange = median - d.min;
            const upperRange = d.max - median;
            switch (position) {
                case 'min': return d.min;
                case 'inner-dark': return median - lowerRange * 0.6;
                case 'inner-light': return median - lowerRange * 0.3;
                case 'median': return median;
                case 'outer-light': return median + upperRange * 0.3;
                case 'outer-dark': return median + upperRange * 0.6;
                case 'max': return d.max;
            }
        };

        const layers: RadialLayer[] = [
            { getInner: (d) => getBand(d, 'min'), getOuter: (d) => getBand(d, 'inner-dark'), darken: 30 },
            { getInner: (d) => getBand(d, 'inner-dark'), getOuter: (d) => getBand(d, 'inner-light'), darken: 20 },
            { getInner: (d) => getBand(d, 'inner-light'), getOuter: (d) => getBand(d, 'outer-light'), darken: 0 },
            { getInner: (d) => getBand(d, 'outer-light'), getOuter: (d) => getBand(d, 'outer-dark'), darken: 20 },
            { getInner: (d) => getBand(d, 'outer-dark'), getOuter: (d) => getBand(d, 'max'), darken: 30 },
        ];

        layers.forEach((layer, layerIndex) => {
            const arcPath = arc<unknown, MonthlyRevenueData>()
                .innerRadius((d) => y(layer.getInner(d)))
                .outerRadius((d) => y(layer.getOuter(d)))
                .startAngle((_, i) => x(i.toString())!)
                .endAngle((_, i) => x(i.toString())! + x.bandwidth())
                .padAngle(0.02)
                .padRadius(innerRadius);

            const normalColor = Color.fromVar('--color-primary-0', '').darken(layer.darken).toHexString();

            g.append('g').selectAll('path').data(this.#data()).join('path')
                .attr('fill', normalColor)
                .attr('d', arcPath as unknown as string)
                .attr('class', (_, i) => `segment-m${i} layer-${layerIndex}`);
        });

        const tooltip = select('body').append('div')
            .attr('class', 'radial-chart-tooltip')
            .style('position', 'absolute').style('visibility', 'hidden')
            .style('background-color', 'rgba(0, 0, 0, 0.9)').style('color', '#fff')
            .style('padding', '12px').style('border-radius', 'var(--bs-border-radius)')
            .style('font-size', '12px').style('pointer-events', 'none').style('z-index', '1000');

        const hoverArc = arc<unknown, MonthlyRevenueData>()
            .innerRadius(innerRadius).outerRadius(outerRadius)
            .startAngle((_, i) => x(i.toString())!)
            .endAngle((_, i) => x(i.toString())! + x.bandwidth())
            .padAngle(0.02).padRadius(innerRadius);

        g.append('g').selectAll('path').data(this.#data()).join('path')
            .attr('fill', 'transparent')
            .attr('d', hoverArc as unknown as string)
            .on('mouseover', (event: MouseEvent, d: MonthlyRevenueData) => {
                const monthIndex = Array.from(this.#data()).indexOf(d);
                layers.forEach((layer, layerIndex) => {
                    const hoverColor = Color.fromVar('--color-primary-0', '').darken(layer.darken).lighten(15).toHexString();
                    selectAll(`.segment-m${monthIndex}.layer-${layerIndex}`).attr('fill', hoverColor);
                });
                tooltip.style('visibility', 'visible').html(`
                    <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #444; padding-bottom: 4px;">${monthNames[monthIndex]}</div>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr><td style="padding: 2px 8px 2px 0;">Min:</td><td style="text-align: right; padding: 2px 0;">${this.#moneyPipe.transform(d.min)}</td></tr>
                        <tr><td style="padding: 2px 8px 2px 0;">Q1:</td><td style="text-align: right; padding: 2px 0;">${this.#moneyPipe.transform(d.q1)}</td></tr>
                        <tr><td style="padding: 2px 8px 2px 0;">Median:</td><td style="text-align: right; padding: 2px 0;">${this.#moneyPipe.transform(d.median)}</td></tr>
                        <tr><td style="padding: 2px 8px 2px 0;">Q3:</td><td style="text-align: right; padding: 2px 0;">${this.#moneyPipe.transform(d.q3)}</td></tr>
                        <tr><td style="padding: 2px 8px 2px 0;">Max:</td><td style="text-align: right; padding: 2px 0;">${this.#moneyPipe.transform(d.max)}</td></tr>
                        <tr style="border-top: 1px solid #444;"><td style="padding: 2px 8px 2px 0; font-weight: bold;">Avg:</td><td style="text-align: right; padding: 2px 0; font-weight: bold;">${this.#moneyPipe.transform(d.avg)}</td></tr>
                    </table>
                `);
            })
            .on('mousemove', (event: MouseEvent) => tooltip.style('top', event.pageY - 10 + 'px').style('left', event.pageX + 10 + 'px'))
            .on('mouseout', () => {
                layers.forEach((layer, layerIndex) => {
                    const normalColor = Color.fromVar('--color-primary-0', '').darken(layer.darken).toHexString();
                    selectAll(`.layer-${layerIndex}`).attr('fill', normalColor);
                });
                tooltip.style('visibility', 'hidden');
            });

        const medianPoints = this.#data().map((d, i) => {
            const angle = x(i.toString())! + x.bandwidth() / 2;
            const radius = y(d.median);
            return { x: Math.cos(angle - Math.PI / 2) * radius, y: Math.sin(angle - Math.PI / 2) * radius };
        });

        g.append('path')
            .datum(medianPoints)
            .attr('d', line<RadialPoint>().x((d) => d.x).y((d) => d.y).curve(curveCardinalClosed.tension(0.5)) as unknown as string)
            .attr('fill', 'none').attr('stroke', '#ffffff').attr('stroke-width', 2);

        svg.append('g').attr('text-anchor', 'middle').call((g) =>
            g.selectAll('g').data(monthNames).join('g')
                .attr('transform', (d: string, i: number) => {
                    const angle = ((x(i.toString())! + x.bandwidth() / 2) * 180) / Math.PI - 90;
                    return `rotate(${angle}) translate(${labelRadius}, 0)`;
                })
                .call((g) =>
                    g.append('text')
                        .attr('transform', (d: string, i: number) => {
                            const angle = ((x(i.toString())! + x.bandwidth() / 2) * 180) / Math.PI - 90;
                            return angle > 0 && angle < 180 ? 'rotate(90)translate(0,3)' : 'rotate(-90)translate(0,3)';
                        })
                        .style('font-size', '11px').style('font-weight', '500').style('fill', '#adb5bd')
                        .text((d: string) => d)
                )
        );
    }
}
