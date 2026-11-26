import { ChangeDetectionStrategy, Component, ElementRef, viewChild, effect, untracked, input } from '@angular/core';
import { Color } from '@constants/Color';
import { TimeValuePointDto } from '@models/_core/api-response';
import { interpolateRgb, scaleLinear, select } from 'd3';
import { dayjs } from '@constants/date/dates';


@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'revenue-spiral-chart',
    templateUrl: './revenue-spiral-chart.component.html',
    styleUrls: ['./revenue-spiral-chart.component.scss'],
    imports: [],
})
export class RevenueSpiralChartComponent {
    spiralContainer = viewChild<ElementRef<HTMLDivElement>>('spiralContainer');

    data = input<TimeValuePointDto[] | undefined>(undefined);
    height = input<number>(400);
    primaryColor = input<string>('#00ff99');
    smoothing = input<number>(0);

    constructor() {
        effect(() => {
            const container = this.spiralContainer();
            this.data();
            this.smoothing();
            if (container) untracked(() => this.renderSpiral());
        });
    }

    getSmoothedData(): TimeValuePointDto[] {
        const data = this.data();
        if (!data || this.smoothing() === 0) return data || [];

        const smoothed: TimeValuePointDto[] = [];
        const smoothing = this.smoothing();
        for (let i = smoothing; i < data.length; i++) {
            const windowData = data.slice(i - smoothing, i + 1);
            const avgRevenue = windowData.reduce((sum, d) => sum + d.value, 0) / windowData.length;
            smoothed.push({
                period: data[i].period,
                value: avgRevenue,
            });
        }
        return smoothed;
    }

    renderSpiral() {
        const ref = this.spiralContainer();
        if (!ref || !this.data() || this.data()!.length === 0) return;

        const displayData = this.getSmoothedData();
        if (displayData.length === 0) return;

        const container = ref.nativeElement;
        const width = container.clientWidth || 400;
        const height = this.height();
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(width, height) / 2 - 40;

        select(container).selectAll('*').remove();

        const svg = select(container).append('svg').attr('width', width).attr('height', height);

        const g = svg.append('g').attr('transform', `translate(${centerX},${centerY})`);

        const sortedData = [...displayData].sort((a, b) => dayjs(a.period, 'YYYY-MM').valueOf() - dayjs(b.period, 'YYYY-MM').valueOf());

        const dataLength = sortedData.length;

        const maxRevenue = Math.max(...(this.data()?.map((d) => d.value) || []));

        const primaryColorObj = new Color(this.primaryColor());
        const hueRotatedDark = primaryColorObj.clone().spin(120).darken(20);
        const colorInterpolator = interpolateRgb(hueRotatedDark.toHexString(), this.primaryColor());

        const revenueScale = scaleLinear()
            .domain([0, maxRevenue * 0.55])
            .range([maxRadius * 0.15, maxRadius]);

        const spiralPoints = sortedData.map((d, i) => {
            const date = dayjs(d.period, 'YYYY-MM');

            const month = date.month(); // 0-11
            const angleInDegrees = month * 30 - 90; // 30 degrees per month
            const angleInRadians = (angleInDegrees * Math.PI) / 180;

            const radius = revenueScale(d.value);

            const t = i / (dataLength - 1);
            return {
                x: Math.cos(angleInRadians) * radius,
                y: Math.sin(angleInRadians) * radius,
                angle: angleInRadians,
                radius: radius,
                color: colorInterpolator(t),
                period: d.period,
                value: d.value,
                month: month,
                year: date.year(),
                t: t,
            };
        });

        for (let month = 0; month < 12; month++) {
            const angleInDegrees = month * 30 - 90;
            const angleInRadians = (angleInDegrees * Math.PI) / 180;

            g.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', Math.cos(angleInRadians) * maxRadius)
                .attr('y2', Math.sin(angleInRadians) * maxRadius)
                .attr('stroke', '#444')
                .attr('stroke-width', 0.5)
                .attr('opacity', 0.3);
        }

        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        monthNames.forEach((monthName, month) => {
            const angleInDegrees = month * 30 - 90;
            const angleInRadians = (angleInDegrees * Math.PI) / 180;
            const labelRadius = maxRadius + 15;

            g.append('text')
                .attr('x', Math.cos(angleInRadians) * labelRadius)
                .attr('y', Math.sin(angleInRadians) * labelRadius)
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('fill', 'var(--tv-text-dim)')
                .attr('font-size', '9px')
                .text(monthName);
        });

        for (let i = 1; i < spiralPoints.length; i++) {
            const prev = spiralPoints[i - 1];
            const curr = spiralPoints[i];

            const prevDate = dayjs(prev.period, 'YYYY-MM');
            const currDate = dayjs(curr.period, 'YYYY-MM');
            const monthsDiff = currDate.diff(prevDate, 'months');

            if (monthsDiff === 1) {
                g.append('line').attr('x1', prev.x).attr('y1', prev.y).attr('x2', curr.x).attr('y2', curr.y).attr('stroke', prev.color).attr('stroke-width', 2).attr('opacity', 0.7);
            }
        }

        g.selectAll('circle.month-point')
            .data(spiralPoints)
            .join('circle')
            .attr('class', 'month-point')
            .attr('cx', (d) => d.x)
            .attr('cy', (d) => d.y)
            .attr('r', 3)
            .attr('fill', (d) => d.color)
            .attr('stroke', '#333')
            .attr('stroke-width', 0.5)
            .attr('opacity', 0.9)
            .append('title')
            .text((d) => `${dayjs(d.period, 'YYYY-MM').format('MMM YYYY')}: ${d.value.toLocaleString()}`);

        g.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 4).attr('fill', hueRotatedDark.toHexString());
    }
}
