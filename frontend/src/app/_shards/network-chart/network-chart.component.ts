import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, effect, inject, input, output } from '@angular/core';
import { Company } from '@models/company/company.model';
import { Connection, ConnectionType, ConnectionTypeOption } from '@models/company/connection.model';
import { select, forceSimulation, forceManyBody, forceCenter, forceLink, forceCollide, forceRadial, drag, zoom, zoomIdentity, Simulation, Selection, ZoomBehavior, D3DragEvent, D3ZoomEvent, ForceLink } from 'd3';
import { GlobalService } from '@models/global.service';

interface NetworkNode {
    id: string;
    name: string;
    group: number;
    net: number;
    keyAccount: boolean;
    color: string | null;
    depth: number;
    radius?: number;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

interface NetworkLink {
    source: string | NetworkNode;
    target: string | NetworkNode;
    strength: number;
    projects_count: number;
    type: ConnectionTypeOption | undefined;
    onPath: boolean;
}

const LINK_LAYOUT: Record<ConnectionType | 'none', { distance: number; pull: number }> = {
    group: { distance: 25, pull: 2 },
    customer: { distance: 60, pull: 1 },
    partner: { distance: 90, pull: 1 },
    referral: { distance: 90, pull: 1 },
    none: { distance: 100, pull: 1 },
    competitor: { distance: 180, pull: 0.3 },
};
export const UNCLASSIFIED_COLOR = 'dark-grey';
const RING_RADII =[0, 170, 330, 450];
const SECOND_DEGREE_OPACITY = 0.5;
const MAX_RADIUS = 30;
const LABEL_RADIUS = 10;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'network-chart',
    template: '<div class="network-chart" style="height:100%;"></div>',
    styles: [':host { display: block; width: 100%; height: 100%; }'],
})
export class NetworkChart {
    root = input<Company | undefined>();
    data = input.required<Connection[]>();
    focus = input<string | Company | null>();
    depth = input<Record<string, number> | null>(null);
    path = input<string[]>([]);

    nodeSelected = output<string | null>();
    nodeOpened = output<string>();

    #nodes: NetworkNode[] = [];
    #links: NetworkLink[] = [];
    #simulation!: Simulation<NetworkNode, NetworkLink>;
    #svg!: Selection<SVGSVGElement, unknown, null, undefined>;
    #linkSelection!: Selection<SVGLineElement, NetworkLink, SVGGElement, unknown>;
    #nodeSelection!: Selection<SVGGElement, NetworkNode, SVGGElement, unknown>;
    #chartElement!: HTMLElement;
    #container!: Selection<SVGGElement, unknown, null, undefined>;
    #zoomBehavior!: ZoomBehavior<SVGSVGElement, unknown>;
    #lastFocusId: string | null = null;
    #isPanning = false;
    #panStart = { x: 0, y: 0 };

    readonly #el = inject(ElementRef);
    readonly #global = inject(GlobalService);

    constructor() {
        afterNextRender(() => {
            this.#chartElement = this.#el.nativeElement.querySelector('.network-chart')!;
            this.initSvg();
            this.initSimulation();
            this.updateData();
        });

        effect(() => {
            this.data();
            this.root();
            this.focus();
            this.depth();
            this.path();
            if (this.#simulation) {
                this.updateData();
            }
        });
    }

    #radiusFor(net: number, maxNet: number): number {
        return net > 0 ? 4 + (MAX_RADIUS - 4) * Math.sqrt(10 ** (net - maxNet)) : 3;
    }

    #showsLabel(n: NetworkNode): boolean {
        return n.keyAccount || n.id === this.#meId() || n.radius! >= LABEL_RADIUS;
    }

    #baseOpacity(n: NetworkNode): number {
        return n.depth >= 2 ? SECOND_DEGREE_OPACITY : 1;
    }

    #nodeFill(n: NetworkNode, meId: string | null): string {
        if (meId && n.id === meId) return '#28a745';
        if (n.net === 0) return '#666';
        if (n.color) return n.color;
        return n.group === 0 ? 'var(--color-primary-0)' : 'var(--tv-text-strong)';
    }

    #meId(): string | null {
        return this.#global.me_id ? String(this.#global.me_id) : null;
    }

    #getLinkColor(link: NetworkLink): string {
        if (link.onPath) return 'var(--color-primary-0)';
        return `var(--tv-accent-${link.type?.color ?? UNCLASSIFIED_COLOR})`;
    }

    #getLinkWidth(link: NetworkLink): number {
        if (link.onPath) return 4;
        if (link.projects_count === 0) return 1;
        return Math.min(Math.max(1 + Math.log(link.projects_count), 1), 5);
    }

    #getFocusId(): string | null {
        const focus = this.focus();
        return typeof focus === 'string' ? focus : focus?.id ? String(focus.id) : null;
    }

    initSvg() {
        this.#svg = select<HTMLElement, unknown>(this.#chartElement).append<SVGSVGElement>('svg').attr('width', '100%').attr('height', '100%');

        this.#container = this.#svg.append<SVGGElement>('g');

        this.#zoomBehavior = zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.1, 4])
            .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
                this.#container.attr('transform', event.transform.toString());
            });

        this.#svg.call(this.#zoomBehavior);

        this.#svg.on('mousedown', (event: MouseEvent) => {
            if (event.button === 1) {
                event.preventDefault();
                this.#isPanning = true;
                this.#panStart = { x: event.clientX, y: event.clientY };
            }
        });

        this.#svg.on('mousemove', (event: MouseEvent) => {
            if (this.#isPanning) {
                event.preventDefault();
                const dx = event.clientX - this.#panStart.x;
                const dy = event.clientY - this.#panStart.y;
                this.#panStart = { x: event.clientX, y: event.clientY };
                const node = this.#svg.node() as (SVGSVGElement & { __zoom?: typeof zoomIdentity }) | null;
                const currentTransform = node?.__zoom || zoomIdentity;
                const newTransform = currentTransform.translate(dx / currentTransform.k, dy / currentTransform.k);
                this.#svg.call(this.#zoomBehavior.transform, newTransform);
            }
        });

        this.#svg.on('mouseup', (event: MouseEvent) => {
            if (event.button === 1) this.#isPanning = false;
        });

        this.#svg.on('mouseleave', () => {
            this.#isPanning = false;
        });

        this.#container.append('g').attr('class', 'links');
        this.#container.append('g').attr('class', 'nodes');

        const defs = this.#svg.append('defs');
        const filter = defs.append('filter').attr('id', 'neumorphism-shadow').attr('x', '-50%').attr('y', '-50%').attr('width', '200%').attr('height', '200%');

        filter.append('feDropShadow').attr('dx', -3).attr('dy', -3).attr('stdDeviation', 3).attr('flood-color', '#000').attr('flood-opacity', 0.8);

        filter.append('feDropShadow').attr('dx', 3).attr('dy', 3).attr('flood-color', '#fff').attr('flood-opacity', 0.1);
    }

    initSimulation() {
        this.#simulation = forceSimulation<NetworkNode, NetworkLink>()
            .force(
                'link',
                forceLink<NetworkNode, NetworkLink>().id((d: NetworkNode) => d.id),
            )
            .force('charge', forceManyBody().strength(-1500))
            .force('center', forceCenter(this.#chartElement.clientWidth / 2, this.#chartElement.clientHeight / 2))
            .on('tick', () => {
                this.#nodeSelection.attr('transform', (d: NetworkNode) => `translate(${d.x},${d.y})`);
                this.#linkSelection
                    .attr('x1', (d: NetworkLink) => (d.source as NetworkNode).x!)
                    .attr('y1', (d: NetworkLink) => (d.source as NetworkNode).y!)
                    .attr('x2', (d: NetworkLink) => (d.target as NetworkNode).x!)
                    .attr('y2', (d: NetworkLink) => (d.target as NetworkNode).y!);
            });
    }

    updateData() {
        const oldNodesById = new Map(this.#nodes.map((n) => [n.id, n]));
        const newNodes: NetworkNode[] = [];
        const data = this.data();
        const root = this.root();
        const focusId = this.#getFocusId();
        const normalizeId = (id: unknown): string => String(id);

        const depth = this.depth();
        const nodeFor = (company: Company, id: string): NetworkNode =>
            oldNodesById.get(id) || { id, name: company.getName(), group: 1, net: company.net || 0, keyAccount: company.is_key_account, color: company.primary_group?.color ?? null, depth: 1 };
        const companyMap = new Map<string, NetworkNode>();
        for (const conn of data) {
            for (const [company, id] of [[conn.company1, normalizeId(conn.company1_id)], [conn.company2, normalizeId(conn.company2_id)]] as const) {
                if (company && !companyMap.has(id)) companyMap.set(id, nodeFor(company, id));
            }
        }
        const rootId = root ? normalizeId(root.id) : null;
        if (root && rootId && !companyMap.has(rootId)) companyMap.set(rootId, nodeFor(root, rootId));
        for (const n of companyMap.values()) {
            n.depth = depth?.[n.id] ?? 1;
            n.group = n.id === rootId ? 0 : 1;
            if (n.id === this.#lastFocusId && n.id !== focusId) n.fx = n.fy = null;
        }
        this.#lastFocusId = focusId;
        newNodes.push(...companyMap.values());

        const nodeIdSet = new Set(newNodes.map((n) => n.id));
        const newLinks: NetworkLink[] = [];
        const meId = this.#global.me_id ? String(this.#global.me_id) : null;
        const path = this.path();
        const pathEdges = new Set(path.slice(1).map((id, i) => [path[i], id].sort().join('-')));

        for (const conn of data) {
            if (!conn.company1 || !conn.company2) continue;
            const id1 = normalizeId(conn.company1_id);
            const id2 = normalizeId(conn.company2_id);
            const projectsCount = conn.projects_count || 0;
            let strength = 1 + projectsCount * 0.5;

            if (meId && (id1 === meId || id2 === meId)) {
                const otherCompany = id1 === meId ? conn.company2 : conn.company1;
                const revenueScore = otherCompany?.net || 0;
                if (revenueScore > 0) strength += revenueScore * 0.05;
            }

            if (nodeIdSet.has(id1) && nodeIdSet.has(id2)) {
                newLinks.push({ source: id1, target: id2, strength, projects_count: projectsCount, type: conn.typeOption(), onPath: pathEdges.has([id1, id2].sort().join('-')) });
            }
        }

        const maxNet = Math.max(0, ...newNodes.map((n) => n.net));
        for (const n of newNodes) n.radius = this.#radiusFor(n.net, maxNet);

        const centerX = this.#chartElement.clientWidth / 2;
        const centerY = this.#chartElement.clientHeight / 2;

        for (const n of newNodes) {
            const oldNode = oldNodesById.get(n.id);
            if (oldNode) {
                n.x = oldNode.x;
                n.y = oldNode.y;
                n.fx = oldNode.fx;
                n.fy = oldNode.fy;
            }
            if (focusId && n.id === focusId) {
                n.fx = centerX;
                n.fy = centerY;
            }
        }

        this.#nodes = newNodes;
        this.#links = newLinks;

        this.#simulation.nodes(this.#nodes);
        this.#simulation.force('collide', forceCollide<NetworkNode>((d) => d.radius! + 3));
        this.#simulation.force('radial', depth ? forceRadial<NetworkNode>((d) => RING_RADII[Math.min(d.depth, RING_RADII.length - 1)], centerX, centerY).strength(0.6) : null);
        const linkForce = this.#simulation.force('link') as ForceLink<NetworkNode, NetworkLink> | undefined;
        if (linkForce) {
            linkForce
                .links(this.#links)
                .distance((d: NetworkLink) => LINK_LAYOUT[d.type?.key ?? 'none'].distance)
                .strength((d: NetworkLink) => d.strength * LINK_LAYOUT[d.type?.key ?? 'none'].pull);
        }

        const linkKey = (d: NetworkLink) => {
            const s = typeof d.source === 'object' ? d.source.id : d.source;
            const t = typeof d.target === 'object' ? d.target.id : d.target;
            return `${s}-${t}`;
        };

        this.#linkSelection = this.#container.select<SVGGElement>('g.links').selectAll<SVGLineElement, NetworkLink>('line').data(this.#links, linkKey);

        this.#linkSelection.exit().remove();

        const linkEnter = this.#linkSelection.enter().append('line').attr('class', 'network-link');

        this.#linkSelection = linkEnter.merge(this.#linkSelection);
        this.#linkSelection
            .style('stroke', (d: NetworkLink) => this.#getLinkColor(d))
            .attr('stroke-opacity', (d: NetworkLink) => (d.onPath || Math.max((d.source as NetworkNode).depth ?? 1, (d.target as NetworkNode).depth ?? 1) < 2 ? 1 : SECOND_DEGREE_OPACITY))
            .attr('stroke-width', (d: NetworkLink) => this.#getLinkWidth(d))
            .attr('stroke-dasharray', (d: NetworkLink) => (d.type?.key === 'competitor' ? '4 3' : null));

        this.#nodeSelection = this.#container
            .select<SVGGElement>('g.nodes')
            .selectAll<SVGGElement, NetworkNode>('g')
            .data(this.#nodes, (d: NetworkNode) => d.id);

        this.#nodeSelection.exit().remove();

        const nodeEnter = this.#nodeSelection
            .enter()
            .append('g')
            .call(
                drag<SVGGElement, NetworkNode>()
                    .on('start', (event, d) => this.#dragstarted(event, d))
                    .on('drag', (event, d) => this.#dragged(event, d))
                    .on('end', (event, d) => this.#dragended(event, d)),
            )
            .on('click', (event: MouseEvent, d: NetworkNode) => this.#togglePin(event, d))
            .on('dblclick', (event: MouseEvent, d: NetworkNode) => {
                event.stopPropagation();
                this.nodeOpened.emit(d.id);
            });

        nodeEnter.append('circle').attr('class', 'key-account-ring').style('fill', 'none').style('stroke', 'var(--tv-accent-yellow)').style('stroke-width', 2);
        nodeEnter.append('circle').attr('class', 'node-circle').style('filter', 'url(#neumorphism-shadow)').style('cursor', 'pointer');

        nodeEnter.append('title');
        nodeEnter.append('text').style('fill', 'var(--tv-text-strong)').style('cursor', 'pointer');

        this.#nodeSelection = nodeEnter.merge(this.#nodeSelection);
        this.#nodeSelection.style('opacity', (n: NetworkNode) => this.#baseOpacity(n));

        this.#nodeSelection
            .select('circle.key-account-ring')
            .attr('r', (n: NetworkNode) => n.radius! + 4)
            .style('display', (n: NetworkNode) => (n.keyAccount ? 'block' : 'none'));

        this.#nodeSelection
            .select('circle.node-circle')
            .attr('r', (n: NetworkNode) => n.radius!)
            .style('fill', (n: NetworkNode) => this.#nodeFill(n, meId))
            .style('fill-opacity', (n: NetworkNode) => (n.net === 0 ? 0.6 : 1))
            .style('stroke', (d: NetworkNode) => {
                if (focusId && d.id === focusId) return 'var(--color-primary-0)';
                return d.fx != null ? 'var(--color-primary-0)' : 'none';
            })
            .style('stroke-width', (d: NetworkNode) => {
                if (focusId && d.id === focusId) return 3;
                return d.fx != null ? 2 : 0;
            });

        this.#nodeSelection.select('title').text((d: NetworkNode) => d.name);

        this.#nodeSelection
            .select('text')
            .attr('x', (d: NetworkNode) => d.radius! + 6)
            .attr('y', 4)
            .style('font-size', (d: NetworkNode) => `${Math.min(14, Math.max(9, 7 + d.radius! * 0.25))}px`)
            .style('font-weight', (d: NetworkNode) => (d.keyAccount ? '600' : null))
            .style('display', (d: NetworkNode) => (this.#showsLabel(d) ? 'block' : 'none'))
            .text((d: NetworkNode) => d.name);

        this.#simulation.alpha(1).restart();
    }

    #highlightConnectedLinks(nodeId: string) {
        const neighbours = new Set([nodeId]);
        for (const l of this.#links) {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s === nodeId) neighbours.add(t);
            if (t === nodeId) neighbours.add(s);
        }
        this.#nodeSelection.style('opacity', (n: NetworkNode) => (neighbours.has(n.id) ? 1 : 0.15));
        this.#nodeSelection.select('text').style('display', (n: NetworkNode) => (neighbours.has(n.id) || this.#showsLabel(n) ? 'block' : 'none'));
        this.#linkSelection
            .style('stroke', (d: NetworkLink) => {
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                return sourceId === nodeId || targetId === nodeId ? 'var(--color-primary-0)' : this.#getLinkColor(d);
            })
            .attr('stroke-width', (d: NetworkLink) => {
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                const base = this.#getLinkWidth(d);
                return sourceId === nodeId || targetId === nodeId ? base + 1 : base;
            });
    }

    #resetLinkHighlight() {
        this.#nodeSelection.style('opacity', (n: NetworkNode) => this.#baseOpacity(n));
        this.#nodeSelection.select('text').style('display', (n: NetworkNode) => (this.#showsLabel(n) ? 'block' : 'none'));
        this.#linkSelection.style('stroke', (d: NetworkLink) => this.#getLinkColor(d)).attr('stroke-width', (d: NetworkLink) => this.#getLinkWidth(d));
    }

    #dragstarted(event: D3DragEvent<SVGGElement, NetworkNode, NetworkNode>, d: NetworkNode) {
        if (!event.active) this.#simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        this.#highlightConnectedLinks(d.id);
    }

    #dragged(event: D3DragEvent<SVGGElement, NetworkNode, NetworkNode>, d: NetworkNode) {
        d.fx = event.x;
        d.fy = event.y;
    }

    #dragended(event: D3DragEvent<SVGGElement, NetworkNode, NetworkNode>, d: NetworkNode) {
        if (!event.active) this.#simulation.alphaTarget(0);
        const focusId = this.#getFocusId();

        if (d.fx != null) {
            this.nodeSelected.emit(d.id);
        } else {
            this.#resetLinkHighlight();
            this.nodeSelected.emit(null);
        }

        this.#nodeSelection
            .select('circle.node-circle')
            .style('stroke', (n: NetworkNode) => {
                if (focusId && n.id === focusId) return 'var(--color-primary-0)';
                return n.fx != null ? 'var(--color-primary-0)' : 'none';
            })
            .style('stroke-width', (n: NetworkNode) => {
                if (focusId && n.id === focusId) return 3;
                return n.fx != null ? 2 : 0;
            });
    }

    #togglePin(event: MouseEvent, d: NetworkNode) {
        event.stopPropagation();

        if (d.fx != null) {
            d.fx = null;
            d.fy = null;
            this.#resetLinkHighlight();
            this.nodeSelected.emit(null);
        } else {
            d.fx = d.x;
            d.fy = d.y;
            this.#highlightConnectedLinks(d.id);
            this.nodeSelected.emit(d.id);
        }

        this.#nodeSelection
            .select('circle.node-circle')
            .style('stroke', (n: NetworkNode) => (n.fx != null ? 'var(--color-primary-0)' : 'none'))
            .style('stroke-width', (n: NetworkNode) => (n.fx != null ? 2 : 0));

        this.#simulation.alpha(0.3).restart();
    }
}
