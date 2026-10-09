import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { FlowSectionBase } from './flow-section.base';

@Component({
    selector: 'flow-risk-classes-section',
    template: `
        <table class="table table-hover mb-0 align-middle">
            <thead>
                <tr>
                    <th i18n="@@i18n.flow.key">key</th>
                    <th i18n="@@i18n.common.name">name</th>
                    <th i18n="@@i18n.flow.level">level</th>
                    <th i18n="@@i18n.flow.releaseApprovals">release approvals</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                @for (risk of riskClasses(); track risk.id) {
                    <tr>
                        <td><input class="form-control form-control-sm" [value]="risk.key" (change)="save('risk-classes', risk.id, { key: value($event) })" /></td>
                        <td><input class="form-control form-control-sm" [value]="risk.name" (change)="save('risk-classes', risk.id, { name: value($event) })" /></td>
                        <td><input type="number" min="0" max="100" class="form-control form-control-sm" [value]="risk.level" (change)="save('risk-classes', risk.id, { level: +value($event) })" /></td>
                        <td><input type="number" min="1" max="10" class="form-control form-control-sm" [value]="risk.release_required_approvals" (change)="save('risk-classes', risk.id, { release_required_approvals: +value($event) })" /></td>
                        <td class="text-end">
                            <i class="text-danger pointer" tabindex="0" i18n-ngbTooltip="@@i18n.common.delete" ngbTooltip="delete" (click)="remove('risk-classes', risk.id, risk.name)" (keyup.enter)="remove('risk-classes', risk.id, risk.name)">delete</i>
                        </td>
                    </tr>
                }
                <tr>
                    <td><input #key class="form-control form-control-sm" i18n-placeholder="@@i18n.flow.key" placeholder="key" /></td>
                    <td><input #name class="form-control form-control-sm" i18n-placeholder="@@i18n.common.name" placeholder="name" /></td>
                    <td><input #level type="number" min="0" max="100" class="form-control form-control-sm" [value]="nextLevel()" /></td>
                    <td><input #approvals type="number" min="1" max="10" class="form-control form-control-sm" value="1" /></td>
                    <td class="text-end">
                        <i class="text-primary pointer" tabindex="0" i18n-ngbTooltip="@@i18n.flow.addRiskClass" ngbTooltip="add risk class" (click)="add(key, name, level, approvals)" (keyup.enter)="add(key, name, level, approvals)">add</i>
                    </td>
                </tr>
            </tbody>
        </table>
        <div class="card-body text-muted small" i18n="@@i18n.flow.riskClassHint">Projects without a risk class count as level 0. Gates whose approval count is empty take it from the release approvals of the project's risk class.</div>
    `,
    imports: [NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowRiskClassesSectionComponent extends FlowSectionBase {
    readonly riskClasses = computed(() => [...this.config().risk_classes].sort((a, b) => a.level - b.level));
    readonly nextLevel = computed(() => (this.riskClasses().at(-1)?.level ?? 0) + 1);

    add(key: HTMLInputElement, name: HTMLInputElement, level: HTMLInputElement, approvals: HTMLInputElement) {
        this.create('risk-classes', { key: key.value.trim(), name: name.value.trim(), level: +level.value, release_required_approvals: +approvals.value }, () => {
            key.value = '';
            name.value = '';
        });
    }
}
