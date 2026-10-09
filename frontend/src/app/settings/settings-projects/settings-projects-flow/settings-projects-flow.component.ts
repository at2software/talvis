import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { GlobalService } from '@models/global.service';
import { modelResource } from '@models/http/model-resource';
import { FlowAdminService } from '@models/flow/flow-admin.service';
import { StateFlowDiagramComponent } from '../settings-projects-states/state-flow-diagram/state-flow-diagram.component';
import { FlowTransitionsSectionComponent } from './flow-transitions-section.component';
import { FlowPhasesSectionComponent } from './flow-phases-section.component';
import { FlowRiskClassesSectionComponent } from './flow-risk-classes-section.component';
import { FlowJobTypesSectionComponent } from './flow-job-types-section.component';
import { FlowAuditSectionComponent } from './flow-audit-section.component';

type Section = 'diagram' | 'transitions' | 'phases' | 'risk' | 'jobTypes' | 'audit';

@Component({
    selector: 'settings-projects-flow',
    templateUrl: './settings-projects-flow.component.html',
    imports: [NgbTooltipModule, SpinnerComponent, StateFlowDiagramComponent, FlowTransitionsSectionComponent, FlowPhasesSectionComponent, FlowRiskClassesSectionComponent, FlowJobTypesSectionComponent, FlowAuditSectionComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsProjectsFlowComponent {
    #service = inject(FlowAdminService);
    #global = inject(GlobalService);

    readonly section = signal<Section>('diagram');
    readonly states = () => this.#global.project_states;

    readonly #config = modelResource(() => this.#service.config());
    readonly config = this.#config.value;

    readonly sections: { key: Section; icon: string; label: string }[] = [
        { key: 'diagram', icon: 'account_tree', label: $localize`:@@i18n.flow.viewDiagram:flow diagram` },
        { key: 'transitions', icon: 'swap_horiz', label: $localize`:@@i18n.flow.transitions:transitions` },
        { key: 'phases', icon: 'flag', label: $localize`:@@i18n.flow.phasesAndGates:phases & gates` },
        { key: 'risk', icon: 'shield', label: $localize`:@@i18n.flow.riskClasses:risk classes` },
        { key: 'jobTypes', icon: 'smart_toy', label: $localize`:@@i18n.flow.jobTypes:job types` },
        { key: 'audit', icon: 'history', label: $localize`:@@i18n.flow.protocol:protocol` },
    ];

    reload() {
        this.#config.reload();
        this.#global.reloadTransitions();
    }
}
