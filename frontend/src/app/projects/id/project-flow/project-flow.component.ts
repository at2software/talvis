import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { GlobalService } from '@models/global.service';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { FlowProjectService } from '@models/flow/flow-project.service';
import type { FlowGateStatusDto, FlowJobFieldDto, FlowJobTypeDto } from '@models/_core/api-response';
import type { Dictionary } from '@constants/constants';

@Component({
    selector: 'project-flow',
    templateUrl: './project-flow.component.html',
    imports: [DatePipe, NgbTooltipModule, EmptyStateComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFlowComponent {
    #guard = inject(ProjectDetailGuard);
    #service = inject(FlowProjectService);
    #global = inject(GlobalService);

    readonly projectId = computed(() => '' + (this.#guard.object()?.id ?? ''));
    readonly isProjectManager = computed(() => !!this.#global.user?.hasAnyRole(['project_manager']));

    readonly #phase = modelResource(() => this.projectId() || undefined, (id) => this.#service.phase(id));
    readonly phase = linkedSignal(() => this.#phase.value());
    readonly #jobs = modelListResource(() => this.projectId() || undefined, (id) => this.#service.jobs(id));
    readonly jobs = this.#jobs.value;
    readonly jobsLoading = this.#jobs.isLoading;
    readonly #jobTypes = modelListResource(() => this.#service.jobTypes());
    readonly jobTypes = this.#jobTypes.value;
    readonly #riskClasses = modelListResource(() => this.#service.riskClasses());
    readonly riskClasses = this.#riskClasses.value;

    readonly creating = signal(false);
    readonly saving = signal(false);
    readonly selectedType = signal<FlowJobTypeDto | undefined>(undefined);
    readonly values = signal<Dictionary<string>>({});

    readonly #converted = computed(() => {
        const type = this.selectedType();
        const payload: Dictionary = {};
        const errors: string[] = [];
        for (const field of type?.input_schema.fields ?? []) {
            const raw = (this.values()[field.key] ?? '').trim();
            if (!raw) continue;
            if (field.type === 'list' && !field.fields) {
                payload[field.key] = raw.split('\n').map((_) => _.trim()).filter(Boolean);
            } else if (field.type === 'object' || field.type === 'list') {
                try {
                    payload[field.key] = JSON.parse(raw);
                } catch {
                    errors.push(field.key);
                }
            } else {
                payload[field.key] = raw;
            }
        }
        return { payload, errors };
    });
    readonly jsonPreview = computed(() => JSON.stringify(this.#converted().payload, null, 2));
    readonly invalidFields = computed(() => this.#converted().errors);
    readonly canSubmit = computed(() => {
        const type = this.selectedType();
        if (!type || this.saving() || this.invalidFields().length) return false;
        const payload = this.#converted().payload;
        return type.input_schema.fields.every((_) => _.key in payload || (!_.required && (!_.required_without || _.required_without in payload)));
    });

    fieldLabel = (field: FlowJobFieldDto) => field.label ?? field.key;
    gateIcon = (gate: FlowGateStatusDto) => (gate.satisfied ? 'check_circle' : gate.pending_approval_id ? 'hourglass_top' : 'radio_button_unchecked');
    gateClass = (gate: FlowGateStatusDto) => (gate.satisfied ? 'text-success' : gate.pending_approval_id ? 'text-warning' : 'text-muted');

    toggleCreate() {
        this.creating.update((_) => !_);
        this.selectedType.set(undefined);
        this.values.set({});
    }
    selectType(key: string) {
        this.selectedType.set(this.jobTypes().find((_) => _.key === key));
        this.values.set({});
    }
    setValue(key: string, value: string) {
        this.values.update((_) => ({ ..._, [key]: value }));
    }
    submit() {
        const type = this.selectedType();
        if (!type || !this.canSubmit()) return;
        this.saving.set(true);
        this.#service.storeJob(this.projectId(), type.key, this.#converted().payload).subscribe({
            next: () => {
                this.saving.set(false);
                this.toggleCreate();
                this.#jobs.reload();
            },
            error: () => this.saving.set(false),
        });
    }
    requestGate(gate: FlowGateStatusDto) {
        this.#service.requestGate(this.projectId(), gate.key).subscribe(() => this.#phase.reload());
    }
    setRiskClass(value: string) {
        this.#service.setRiskClass(this.projectId(), value ? +value : null).subscribe((_) => this.phase.set(_));
    }
}
