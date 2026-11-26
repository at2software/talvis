import { ChangeDetectionStrategy, Component, ElementRef, viewChild, effect, untracked, input } from '@angular/core';
import { SankeyDataDto } from '@models/_core/api-response';

import { MoneyPipe } from '@pipes/money.pipe';
import { drag, select } from 'd3';
import { sankey, sankeyLinkHorizontal, sankeyJustify, SankeyExtraProperties, SankeyGraph, SankeyNode as D3SankeyNode, SankeyLink as D3SankeyLink } from 'd3-sankey';


interface SankeyNodeData extends SankeyExtraProperties {
    id: number;
    name: string;
    color: string;
    isFinished: boolean | undefined;
    column: number;
    x: number;
}

type ComputedNode = D3SankeyNode<SankeyNodeData, object>;
type ComputedLink = D3SankeyLink<SankeyNodeData, object>;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'sankey-chart',
    templateUrl: './sankey-chart.component.html',
    styleUrls: ['./sankey-chart.component.scss'],
    imports: [],
})
export class SankeyChartComponent {
    sankeyContainer = viewChild<ElementRef<HTMLDivElement>>('sankeyContainer');
    linkTooltip = viewChild<ElementRef<HTMLDivElement>>('linkTooltip');

    data = input<SankeyDataDto | undefined>(undefined);
    mode = input<'count' | 'money'>('count');
    height = input<number>(200);
    stateColumns = input<Record<number, number> | undefined>(undefined);
    marginLeft = input<number>(80);
    marginRight = input<number>(80);
    showLabels = input<boolean>(true);

    money = new MoneyPipe();

    constructor() {
        effect(() => {
            const container = this.sankeyContainer();
            this.data();
            this.mode();
            if (container) untracked(() => this.renderSankey());
        });
    }

    renderSankey() {
        const ref = this.sankeyContainer();
        if (!ref || !this.data) return;

        const container = ref.nativeElement;
        const width = container.clientWidth || 600;
        const h = this.height();

        select(container).selectAll('*').remove();

        const data = this.data();
        if (!data || !data.nodes || !data.links) return;

        const isCountMode = this.mode() === 'count';

        const stateColumns = this.stateColumns() || {
            1: 0, 6: 1, 2: 2, 8: 3, 9: 4, 3: 5, 4: 5, 5: 5, 7: 5,
        };

        const columnCount = 6;
        const marginLeft = this.marginLeft();
        const marginRight = this.marginRight();
        const columnWidth = (width - marginLeft - marginRight) / (columnCount - 1);

        const svg = select(container).append('svg').attr('width', width).attr('height', h);

        const nodesById = new Map<number, SankeyNodeData>();
        data.nodes.forEach((node) => {
            const column = stateColumns[node.id] ?? 0;
            nodesById.set(node.id, {
                id: node.id,
                name: node.name,
                color: node.color,
                isFinished: node.is_finished,
                column: column,
                x: marginLeft + column * columnWidth,
            });
        });

        const nodes = Array.from(nodesById.values());

        const links = data.links
            .map((link) => {
                const sourceNode = nodesById.get(link.source);
                const targetNode = nodesById.get(link.target);
                if (!sourceNode || !targetNode) return null;
                if (sourceNode.column >= targetNode.column) return null;
                return { source: link.source, target: link.target, value: isCountMode ? link.count : link.net };
            })
            .filter((link): link is { source: number; target: number; value: number } => link !== null);

        if (nodes.length === 0 || links.length === 0) return;

        const sankeyGenerator = sankey<SankeyNodeData, object>()
            .nodeId((d) => d.id)
            .nodeWidth(15)
            .nodePadding(10)
            .nodeAlign(sankeyJustify)
            .extent([
                [marginLeft, 10],
                [width - marginRight, h - 10],
            ]);

        const graph: SankeyGraph<SankeyNodeData, object> = sankeyGenerator({
            nodes: nodes.map((d) => Object.assign({}, d)),
            links: links.map((d) => Object.assign({}, d)),
        });

        graph.nodes.forEach((node) => {
            const orig = nodesById.get(node.id);
            if (orig) {
                node.x0 = orig.x;
                node.x1 = orig.x + 15;
            }
        });

        const linkGenerator = sankeyLinkHorizontal();
        const tooltipEl = this.linkTooltip()?.nativeElement;

        const linkPaths = svg.append('g')
            .attr('fill', 'none')
            .selectAll<SVGPathElement, ComputedLink>('path')
            .data(graph.links)
            .join('path')
            .attr('class', 'link')
            .attr('d', (d) => linkGenerator(d))
            .attr('stroke', (d) => (d.source as ComputedNode).color || '#666')
            .attr('stroke-width', (d) => Math.max(1, d.width ?? 1))
            .attr('opacity', 0.5)
            .style('cursor', 'default')
            .on('mouseover', (event: MouseEvent, d) => {
                if (!tooltipEl) return;
                const src = d.source as ComputedNode;
                const tgt = d.target as ComputedNode;
                const pct = src.value ? Math.round((d.value / src.value) * 100) : 0;
                const val = isCountMode ? d.value : this.money.transform(d.value);
                tooltipEl.innerHTML =
                    `<span style="color:${src.color}">[${src.name}]</span>` +
                    ` ──${pct}%──► ` +
                    `<span style="color:${tgt.color}">[${tgt.name}]</span>` +
                    `<span style="opacity:0.65"> (${val})</span>`;
                tooltipEl.style.display = 'block';
                tooltipEl.style.left = event.clientX + 12 + 'px';
                tooltipEl.style.top = event.clientY - 32 + 'px';
            })
            .on('mousemove', (event: MouseEvent) => {
                if (!tooltipEl) return;
                tooltipEl.style.left = event.clientX + 12 + 'px';
                tooltipEl.style.top = event.clientY - 32 + 'px';
            })
            .on('mouseout', () => {
                if (tooltipEl) tooltipEl.style.display = 'none';
            });

        const nodeRects = svg.append('g')
            .selectAll<SVGRectElement, ComputedNode>('rect')
            .data(graph.nodes)
            .join('rect')
            .attr('class', 'node')
            .attr('x', (d) => d.x0!)
            .attr('y', (d) => d.y0!)
            .attr('height', (d) => d.y1! - d.y0!)
            .attr('width', (d) => d.x1! - d.x0!)
            .attr('fill', (d) => d.color || '#666')
            .style('cursor', 'ns-resize');

        nodeRects.append('title')
            .text((d) => `${d.name}\n${isCountMode ? (d.value ?? 0) : this.money.transform(d.value ?? 0)}`);

        const labels = this.showLabels()
            ? svg.append('g')
                .style('font', '10px sans-serif')
                .style('fill', 'var(--tv-text-strong)')
                .selectAll<SVGTextElement, ComputedNode>('text')
                .data(graph.nodes)
                .join('text')
                .attr('class', 'node-label')
                .attr('x', (d) => (d.isFinished ? d.x0! - 6 : d.x1! + 6))
                .attr('y', (d) => (d.y1! + d.y0!) / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', (d) => (d.isFinished ? 'end' : 'start'))
                .text((d) => d.name)
            : null;

        const nodeDrag = drag<SVGRectElement, ComputedNode>().on('drag', (event, d) => {
            const nodeHeight = d.y1! - d.y0!;
            const newY0 = Math.max(10, Math.min(h - 10 - nodeHeight, d.y0! + event.dy));
            d.y0 = newY0;
            d.y1 = newY0 + nodeHeight;

            nodeRects.filter((n) => n === d).attr('y', d.y0!);

            sankeyGenerator.update(graph);
            linkPaths.attr('d', (l) => linkGenerator(l));
            if (labels) labels.filter((n) => n === d).attr('y', (d.y1! + d.y0!) / 2);
        });

        nodeRects.call(nodeDrag);
    }
}
