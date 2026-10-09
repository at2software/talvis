import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { FlowSectionBase } from './flow-section.base';

@Component({
    selector: 'flow-transitions-section',
    template: `
        @let _config = config();
        <table class="table table-hover mb-0 align-middle">
            <thead>
                <tr>
                    <th i18n="@@i18n.flow.from">from</th>
                    <th i18n="@@i18n.flow.to">to</th>
                    <th i18n="@@i18n.flow.requiredRole">required role</th>
                    <th class="text-center" i18n="@@i18n.flow.active">active</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                @for (transition of sorted(); track transition.id) {
                    <tr [class.text-muted]="!transition.active">
                        <td>{{ stateName(transition.from_state_id) }}</td>
                        <td>{{ stateName(transition.to_state_id) }}</td>
                        <td>
                            <select class="form-select form-select-sm" (change)="save('transitions', transition.id, { required_role: value($event) || null })">
                                <option value="" [selected]="!transition.required_role">–</option>
                                @for (role of _config.roles; track role) {
                                    <option [value]="role" [selected]="transition.required_role === role">{{ role }}</option>
                                }
                            </select>
                        </td>
                        <td class="text-center">
                            <input type="checkbox" class="form-check-input" [checked]="transition.active" (change)="save('transitions', transition.id, { active: checked($event) })" />
                        </td>
                        <td class="text-end">
                            <i class="text-danger pointer" tabindex="0" i18n-ngbTooltip="@@i18n.common.delete" ngbTooltip="delete" (click)="remove('transitions', transition.id, stateName(transition.from_state_id) + ' → ' + stateName(transition.to_state_id))" (keyup.enter)="remove('transitions', transition.id, stateName(transition.from_state_id) + ' → ' + stateName(transition.to_state_id))">delete</i>
                        </td>
                    </tr>
                }
                <tr>
                    <td>
                        <select class="form-select form-select-sm" (change)="newFrom.set(+value($event) || null)">
                            <option value="" [selected]="!newFrom()">–</option>
                            @for (state of _config.states; track state.id) {
                                <option [value]="state.id" [selected]="newFrom() === state.id">{{ state.name }}</option>
                            }
                        </select>
                    </td>
                    <td>
                        <select class="form-select form-select-sm" (change)="newTo.set(+value($event) || null)">
                            <option value="" [selected]="!newTo()">–</option>
                            @for (state of _config.states; track state.id) {
                                <option [value]="state.id" [selected]="newTo() === state.id">{{ state.name }}</option>
                            }
                        </select>
                    </td>
                    <td colspan="2" class="text-muted small">
                        @if (exists()) {
                            <span i18n="@@i18n.flow.transitionExists">this transition already exists</span>
                        }
                    </td>
                    <td class="text-end">
                        @if (canAdd()) {
                            <i class="text-primary pointer" tabindex="0" i18n-ngbTooltip="@@i18n.flow.addTransition" ngbTooltip="add transition" (click)="add()" (keyup.enter)="add()">add</i>
                        }
                    </td>
                </tr>
            </tbody>
        </table>
    `,
    imports: [NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowTransitionsSectionComponent extends FlowSectionBase {
    readonly newFrom = signal<number | null>(null);
    readonly newTo = signal<number | null>(null);

    readonly sorted = computed(() => {
        const name = (id: number) => this.stateName(id);
        return [...this.config().transitions].sort((a, b) => name(a.from_state_id).localeCompare(name(b.from_state_id)) || name(a.to_state_id).localeCompare(name(b.to_state_id)));
    });
    readonly exists = computed(() => this.config().transitions.some((_) => _.from_state_id === this.newFrom() && _.to_state_id === this.newTo()));
    readonly canAdd = computed(() => !!this.newFrom() && !!this.newTo() && this.newFrom() !== this.newTo() && !this.exists());

    add() {
        if (!this.canAdd()) return;
        this.create('transitions', { from_state_id: this.newFrom(), to_state_id: this.newTo() }, () => this.newTo.set(null));
    }
}
