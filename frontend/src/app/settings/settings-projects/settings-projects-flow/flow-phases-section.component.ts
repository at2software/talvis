import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import type { FlowGateDto, FlowPhaseDto } from '@models/_core/api-response';
import { FlowSectionBase } from './flow-section.base';

@Component({
    selector: 'flow-phases-section',
    template: `
        @let _config = config();
        <ul class="list-group list-group-flush">
            @for (phase of phases(); track phase.id) {
                <li class="list-group-item py-3">
                    <div class="row g-2 align-items-center mb-2">
                        <div class="col-md-2">
                            <input class="form-control form-control-sm" [value]="phase.key" (change)="save('phases', phase.id, { key: value($event) })" i18n-placeholder="@@i18n.flow.key" placeholder="key" />
                        </div>
                        <div class="col-md-3">
                            <input class="form-control form-control-sm fw-bold" [value]="phase.name" (change)="save('phases', phase.id, { name: value($event) })" i18n-placeholder="@@i18n.common.name" placeholder="name" />
                        </div>
                        <div class="col-md-3">
                            <select class="form-select form-select-sm" (change)="save('phases', phase.id, { project_state_id: +value($event) })">
                                @for (state of _config.states; track state.id) {
                                    <option [value]="state.id" [selected]="phase.project_state_id === state.id">{{ state.name }}</option>
                                }
                            </select>
                        </div>
                        <div class="col-md-2">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text" i18n="@@i18n.flow.sort">sort</span>
                                <input type="number" class="form-control" [value]="phase.sort" (change)="save('phases', phase.id, { sort: +value($event) })" />
                            </div>
                        </div>
                        <div class="col-md-2 text-end">
                            <i class="text-danger pointer" tabindex="0" i18n-ngbTooltip="@@i18n.common.delete" ngbTooltip="delete" (click)="remove('phases', phase.id, phase.name)" (keyup.enter)="remove('phases', phase.id, phase.name)">delete</i>
                        </div>
                    </div>
                    <table class="table table-sm mb-0 align-middle gates">
                        <thead>
                            <tr class="small text-muted">
                                <th i18n="@@i18n.flow.gate">gate</th>
                                <th></th>
                                <th i18n="@@i18n.flow.requiredRole">required role</th>
                                <th i18n="@@i18n.flow.approvals">approvals</th>
                                <th i18n="@@i18n.flow.condition">condition</th>
                                <th i18n="@@i18n.flow.sort">sort</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (gate of phase.gates; track gate.id) {
                                <tr>
                                    <td><input class="form-control form-control-sm" [value]="gate.key" (change)="save('gates', gate.id, { key: value($event) })" /></td>
                                    <td><input class="form-control form-control-sm" [value]="gate.name" (change)="save('gates', gate.id, { name: value($event) })" /></td>
                                    <td>
                                        <select class="form-select form-select-sm" (change)="save('gates', gate.id, { required_role: value($event) })">
                                            @for (role of _config.roles; track role) {
                                                <option [value]="role" [selected]="gate.required_role === role">{{ role }}</option>
                                            }
                                        </select>
                                    </td>
                                    <td>
                                        <input type="number" min="1" max="10" class="form-control form-control-sm" [value]="gate.required_approvals ?? ''" (change)="save('gates', gate.id, { required_approvals: numberOrNull($event) })" i18n-placeholder="@@i18n.flow.approvalsFromRiskClass" placeholder="per risk class" />
                                    </td>
                                    <td>
                                        <div class="input-group input-group-sm">
                                            <select class="form-select" (change)="setCondition(gate, value($event), riskLevel(gate) ?? 2)">
                                                <option value="always" [selected]="riskLevel(gate) === null" i18n="@@i18n.flow.conditionAlways">always</option>
                                                <option value="risk" [selected]="riskLevel(gate) !== null" i18n="@@i18n.flow.conditionRisk">risk level ≥</option>
                                            </select>
                                            @if (riskLevel(gate) !== null) {
                                                <input type="number" min="0" class="form-control" [value]="riskLevel(gate)" (change)="setCondition(gate, 'risk', +value($event))" />
                                            }
                                        </div>
                                    </td>
                                    <td><input type="number" class="form-control form-control-sm" [value]="gate.sort" (change)="save('gates', gate.id, { sort: +value($event) })" /></td>
                                    <td class="text-end">
                                        <i class="text-danger pointer" tabindex="0" i18n-ngbTooltip="@@i18n.common.delete" ngbTooltip="delete" (click)="remove('gates', gate.id, gate.name)" (keyup.enter)="remove('gates', gate.id, gate.name)">delete</i>
                                    </td>
                                </tr>
                            }
                            <tr>
                                <td><input #gateKey class="form-control form-control-sm" i18n-placeholder="@@i18n.flow.newGateKey" placeholder="new gate key" /></td>
                                <td><input #gateName class="form-control form-control-sm" i18n-placeholder="@@i18n.common.name" placeholder="name" /></td>
                                <td>
                                    <select #gateRole class="form-select form-select-sm">
                                        @for (role of _config.roles; track role) {
                                            <option [value]="role">{{ role }}</option>
                                        }
                                    </select>
                                </td>
                                <td colspan="3"></td>
                                <td class="text-end">
                                    <i class="text-primary pointer" tabindex="0" i18n-ngbTooltip="@@i18n.flow.addGate" ngbTooltip="add gate" (click)="addGate(phase, gateKey, gateName, gateRole)" (keyup.enter)="addGate(phase, gateKey, gateName, gateRole)">add</i>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </li>
            }
            <li class="list-group-item py-3">
                <div class="row g-2 align-items-center">
                    <div class="col-md-2"><input #phaseKey class="form-control form-control-sm" i18n-placeholder="@@i18n.flow.newPhaseKey" placeholder="new phase key" /></div>
                    <div class="col-md-3"><input #phaseName class="form-control form-control-sm" i18n-placeholder="@@i18n.common.name" placeholder="name" /></div>
                    <div class="col-md-3">
                        <select #phaseState class="form-select form-select-sm">
                            @for (state of freeStates(); track state.id) {
                                <option [value]="state.id">{{ state.name }}</option>
                            }
                        </select>
                    </div>
                    <div class="col-md-2"></div>
                    <div class="col-md-2 text-end">
                        <i class="text-primary pointer" tabindex="0" i18n-ngbTooltip="@@i18n.flow.addPhase" ngbTooltip="add phase" (click)="addPhase(phaseKey, phaseName, phaseState)" (keyup.enter)="addPhase(phaseKey, phaseName, phaseState)">add</i>
                    </div>
                </div>
            </li>
        </ul>
    `,
    styles: `
        .gates th:first-child,
        .gates td:first-child {
            padding-left: 0;
        }
    `,
    imports: [NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowPhasesSectionComponent extends FlowSectionBase {
    readonly phases = computed(() => [...this.config().phases].sort((a, b) => a.sort - b.sort));
    readonly freeStates = computed(() => this.config().states.filter((state) => !this.config().phases.some((_) => _.project_state_id === state.id)));

    riskLevel = (gate: FlowGateDto): number | null => (gate.condition?.['risk_level_gte'] as number | undefined) ?? null;

    setCondition(gate: FlowGateDto, kind: string, level: number) {
        this.save('gates', gate.id, { condition: kind === 'risk' ? { risk_level_gte: Math.max(0, Math.round(level)) } : { always: true } });
    }
    addGate(phase: FlowPhaseDto, key: HTMLInputElement, name: HTMLInputElement, role: HTMLSelectElement) {
        this.create('gates', { phase_id: phase.id, key: key.value.trim(), name: name.value.trim(), required_role: role.value, condition: { always: true }, sort: (phase.gates.at(-1)?.sort ?? 0) + 10 }, () => {
            key.value = '';
            name.value = '';
        });
    }
    addPhase(key: HTMLInputElement, name: HTMLInputElement, state: HTMLSelectElement) {
        this.create('phases', { key: key.value.trim(), name: name.value.trim(), project_state_id: +state.value, sort: (this.phases().at(-1)?.sort ?? 0) + 10 }, () => {
            key.value = '';
            name.value = '';
        });
    }
}
