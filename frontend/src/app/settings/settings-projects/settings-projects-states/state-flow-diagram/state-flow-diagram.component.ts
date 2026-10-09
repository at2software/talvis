import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { EChartsOption, GraphSeriesOption } from 'echarts';
import { EchartsComponent } from '@app/_charts/echarts-wrapper/echarts-wrapper.component';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS } from '@app/_charts/echarts-presets';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { escapeHtml } from '@constants/html/escape-html';
import { modelResource } from '@models/http/model-resource';
import { FlowConfigService } from '@models/flow/flow-config.service';
import { ProjectState } from '@models/project/project-state.model';
import type { FlowGateDto, FlowPhaseDto, FlowTransitionDto } from '@models/_core/api-response';

interface Requirement {
    role: string | null;
    gates: FlowGateDto[];
    phase: FlowPhaseDto | null;
}

const COLUMN_WIDTH = 220;
const ROW_HEIGHT = 60;
const MUTED_EDGE = 'rgba(255, 255, 255, 0.35)';
const REQUIREMENT_EDGE = '#ffc107';
const TEXT = '#ffffff';
const NODE_WIDTH = 110;
const NODE_HEIGHT = 24;
const PHASE_NODE_HEIGHT = 34;
const RADIUS = 5;

const roundedBox = (w: number, h: number, r = RADIUS) =>
    `path://M${r},0 H${w - r} Q${w},0 ${w},${r} V${h - r} Q${w},${h} ${w - r},${h} H${r} Q0,${h} 0,${h - r} V${r} Q0,0 ${r},0 Z`;

@Component({
    selector: 'state-flow-diagram',
    template: `
        @if (options(); as _options) {
            <nx-echarts [options]="_options"></nx-echarts>
            <div class="d-flex flex-wrap gap-4 small text-muted px-3 pb-3">
                <span><span class="legend-line" [style.background]="mutedEdge"></span><span i18n="@@i18n.flow.legendFree">transition without requirements</span></span>
                <span><span class="legend-line" [style.background]="requirementEdge"></span><span i18n="@@i18n.flow.legendRequirements">transition with requirements (role or gates)</span></span>
                <span i18n="@@i18n.flow.legendColumns">columns follow the phases; finished states on the right</span>
            </div>
        } @else {
            <spinner class="p-5"></spinner>
        }
    `,
    styles: `
        .legend-line {
            display: inline-block;
            width: 24px;
            height: 3px;
            margin-right: 6px;
            vertical-align: middle;
        }
    `,
    imports: [EchartsComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StateFlowDiagramComponent {
    #service = inject(FlowConfigService);

    states = input.required<ProjectState[]>();

    readonly mutedEdge = MUTED_EDGE;
    readonly requirementEdge = REQUIREMENT_EDGE;

    readonly #transitions = modelResource(() => this.#service.transitions());
    readonly #configuration = modelResource(() => this.#service.configuration());

    readonly options = computed<EChartsOption | undefined>(() => {
        const transitions = this.#transitions.value();
        const configuration = this.#configuration.value();
        if (!transitions || !configuration) return undefined;
        return this.#build(this.states(), transitions, configuration.phases);
    });

    #build(states: ProjectState[], transitions: FlowTransitionDto[], phases: FlowPhaseDto[]): EChartsOption {
        const phaseOf = new Map(phases.map((_) => [_.project_state_id, _]));
        const positions = this.#layout(states, transitions, phases);
        const tallest = Math.max(1, ...[...positions.values()].map((_) => _.row + 1));

        const nodes: GraphSeriesOption['data'] = states.map((state) => {
            const { column, row } = positions.get(+state.id)!;
            const phase = phaseOf.get(+state.id);
            return {
                id: '' + state.id,
                name: state.name,
                x: column * COLUMN_WIDTH,
                y: row * ROW_HEIGHT,
                symbol: roundedBox(NODE_WIDTH, phase ? PHASE_NODE_HEIGHT : NODE_HEIGHT),
                symbolSize: [NODE_WIDTH, phase ? PHASE_NODE_HEIGHT : NODE_HEIGHT],
                itemStyle: { color: state.color, borderColor: phase ? TEXT : state.color, borderWidth: phase ? 1.5 : 0 },
                label: { show: true, color: TEXT, fontSize: 11, lineHeight: 13, formatter: phase ? `{b}\n{phase|${$localize`:@@i18n.flow.phase:phase`}: ${phase.name}}` : '{b}', rich: { phase: { fontSize: 9, lineHeight: 11, color: TEXT, opacity: 0.8 } } },
                tooltip: { formatter: () => this.#nodeTooltip(state, phase) },
            };
        });

        const pairs = new Set(transitions.map((_) => `${_.from_state_id}>${_.to_state_id}`));
        const links: GraphSeriesOption['links'] = transitions.map((transition) => {
            const requirement = this.#requirement(transition, phaseOf);
            const hasRequirement = !!requirement.role || requirement.gates.length > 0;
            const bidirectional = pairs.has(`${transition.to_state_id}>${transition.from_state_id}`);
            return {
                source: '' + transition.from_state_id,
                target: '' + transition.to_state_id,
                lineStyle: { color: hasRequirement ? REQUIREMENT_EDGE : MUTED_EDGE, width: hasRequirement ? 2.5 : 1.2, curveness: bidirectional ? 0.25 : 0.1 },
                label: { show: hasRequirement, color: REQUIREMENT_EDGE, fontSize: 10, formatter: () => this.#edgeLabel(requirement) },
                tooltip: { formatter: () => this.#edgeTooltip(transition, requirement, states) },
            };
        });

        return {
            chart: { height: tallest * ROW_HEIGHT + 120 },
            tooltip: { ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS, trigger: 'item', confine: true },
            series: [
                {
                    type: 'graph',
                    layout: 'none',
                    roam: true,
                    draggable: true,
                    edgeSymbol: ['none', 'arrow'],
                    edgeSymbolSize: 9,
                    data: nodes,
                    links,
                    emphasis: { focus: 'adjacency', lineStyle: { width: 3 } },
                    left: 90,
                    right: 90,
                    top: 40,
                    bottom: 40,
                },
            ],
        } as EChartsOption;
    }

    #layout(states: ProjectState[], transitions: FlowTransitionDto[], phases: FlowPhaseDto[]): Map<number, { column: number; row: number }> {
        const phaseIndex = new Map([...phases].sort((a, b) => a.sort - b.sort).map((phase, i) => [phase.project_state_id, i]));
        const lastColumn = Math.max(2, phaseIndex.size);
        const byId = new Map(states.map((_) => [+_.id, _]));
        const predecessors = (id: number) => transitions.filter((_) => _.to_state_id === id && _.from_state_id !== id).map((_) => byId.get(_.from_state_id)).filter((_) => !!_);
        const columns = new Map<number, number>();

        const columnOf = (state: ProjectState, visiting = new Set<number>()): number => {
            const id = +state.id;
            if (columns.has(id)) return columns.get(id)!;
            let column: number;
            if (phaseIndex.has(id)) {
                column = phaseIndex.get(id)!;
            } else if (state.progress === ProjectState.ProgressPrepared) {
                column = 0;
            } else if (state.progress === ProjectState.ProgressFinished) {
                const preds = predecessors(id);
                column = preds.length && preds.every((_) => !phaseIndex.has(+_.id) ? _.progress === ProjectState.ProgressPrepared : phaseIndex.get(+_.id) === 0) ? 0 : lastColumn;
            } else {
                visiting.add(id);
                const forward = predecessors(id).filter((_) => !visiting.has(+_.id) && !phaseIndex.has(+_.id) && _.progress !== ProjectState.ProgressFinished);
                column = Math.min(lastColumn - 1, Math.max(1, ...forward.map((_) => columnOf(_, visiting) + 1)));
            }
            columns.set(id, column);
            return column;
        };

        const ordered = [...states].sort((a, b) => a.progress - b.progress || +a.id - +b.id);
        ordered.forEach((_) => columnOf(_));

        const positions = new Map<number, { column: number; row: number }>();
        const nextRow = new Map<number, number>();
        for (const state of ordered.filter((_) => phaseIndex.has(+_.id))) {
            const column = columns.get(+state.id)!;
            const row = phaseIndex.get(+state.id)!;
            positions.set(+state.id, { column, row });
            nextRow.set(column, Math.max(nextRow.get(column) ?? 0, row + 1));
        }
        for (const state of ordered.filter((_) => !phaseIndex.has(+_.id))) {
            const column = columns.get(+state.id)!;
            const row = nextRow.get(column) ?? 0;
            positions.set(+state.id, { column, row });
            nextRow.set(column, row + 1);
        }
        return positions;
    }

    #requirement(transition: FlowTransitionDto, phaseOf: Map<number, FlowPhaseDto>): Requirement {
        const from = phaseOf.get(transition.from_state_id) ?? null;
        const to = phaseOf.get(transition.to_state_id);
        const gated = !!from && !!to && to.sort > from.sort;
        return { role: transition.required_role, gates: gated ? from.gates : [], phase: gated ? from : null };
    }

    #gateText(gate: FlowGateDto): string {
        const approvals = gate.required_approvals ?? $localize`:@@i18n.flow.approvalsFromRiskClass:per risk class`;
        const condition = gate.condition?.['risk_level_gte'] !== undefined ? ` · ${$localize`:@@i18n.flow.riskAtLeast:risk ≥`} ${gate.condition['risk_level_gte']}` : '';
        return `${gate.name} (${gate.required_role}, ${approvals}×${condition})`;
    }

    #edgeLabel(requirement: Requirement): string {
        const parts: string[] = [];
        if (requirement.role) parts.push(`${$localize`:@@i18n.flow.requiresRole:role`}: ${requirement.role}`);
        if (requirement.gates.length) parts.push(`${$localize`:@@i18n.flow.requiresGates:gates`}: ${requirement.gates.map((_) => _.name).join(', ')}`);
        return parts.join('\n');
    }

    #edgeTooltip(transition: FlowTransitionDto, requirement: Requirement, states: ProjectState[]): string {
        const name = (id: number) => escapeHtml(states.find((_) => +_.id === id)?.name ?? '#' + id);
        const lines = [`<strong>${name(transition.from_state_id)} → ${name(transition.to_state_id)}</strong>`];
        if (requirement.role) lines.push(`${$localize`:@@i18n.flow.requiresRole:role`}: ${escapeHtml(requirement.role)}`);
        if (requirement.phase) {
            lines.push(`${$localize`:@@i18n.flow.leavesPhase:leaves phase`} ${escapeHtml(requirement.phase.name)}:`);
            requirement.gates.forEach((gate) => lines.push(`· ${escapeHtml(this.#gateText(gate))}`));
        }
        if (!requirement.role && !requirement.gates.length) lines.push($localize`:@@i18n.flow.legendFree:transition without requirements`);
        return lines.join('<br>');
    }

    #nodeTooltip(state: ProjectState, phase: FlowPhaseDto | undefined): string {
        const lines = [`<strong>${escapeHtml(state.name)}</strong>`];
        if (phase) {
            lines.push(`${$localize`:@@i18n.flow.phase:phase`}: ${escapeHtml(phase.name)}`);
            phase.gates.forEach((gate) => lines.push(`· ${escapeHtml(this.#gateText(gate))}`));
        }
        return lines.join('<br>');
    }
}
