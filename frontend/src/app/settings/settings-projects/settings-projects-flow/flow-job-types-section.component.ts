import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import type { Dictionary } from '@constants/constants';
import { FlowSectionBase } from './flow-section.base';

const EXAMPLE_SCHEMA = { fields: [{ key: 'issue', type: 'url', required: true, label: 'Issue', description: '' }] };

@Component({
    selector: 'flow-job-types-section',
    template: `
        <ul class="list-group list-group-flush">
            @for (type of config().job_types; track type.id) {
                <li class="list-group-item py-3">
                    <div class="row g-2 align-items-center mb-2">
                        <div class="col-md-3"><input class="form-control form-control-sm" [value]="type.key" (change)="save('job-types', type.id, { key: value($event) })" /></div>
                        <div class="col-md-4"><input class="form-control form-control-sm fw-bold" [value]="type.name" (change)="save('job-types', type.id, { name: value($event) })" /></div>
                        <div class="col-md-3">
                            <div class="input-group input-group-sm">
                                <span class="input-group-text" i18n="@@i18n.flow.reviewGates">review gates</span>
                                <input class="form-control" [value]="(type.review_gate_keys ?? []).join(', ')" (change)="save('job-types', type.id, { review_gate_keys: gateKeys(value($event)) })" />
                            </div>
                        </div>
                        <div class="col-md-2 text-end">
                            <span class="text-muted small me-2">{{ type.jobs_count }} <span i18n="@@i18n.flow.jobsShort">jobs</span></span>
                            @if (!type.jobs_count) {
                                <i class="text-danger pointer" tabindex="0" i18n-ngbTooltip="@@i18n.common.delete" ngbTooltip="delete" (click)="remove('job-types', type.id, type.name)" (keyup.enter)="remove('job-types', type.id, type.name)">delete</i>
                            }
                        </div>
                    </div>
                    <textarea class="form-control form-control-sm mb-2" rows="2" [value]="type.description ?? ''" (change)="save('job-types', type.id, { description: value($event) || null })" i18n-placeholder="@@i18n.common.description" placeholder="description"></textarea>
                    <label class="form-label small text-muted" i18n="@@i18n.flow.inputSchema">input schema (JSON)</label>
                    <textarea class="form-control form-control-sm font-monospace" rows="8" [class.is-invalid]="invalid()[type.id]" [value]="pretty(type.input_schema)" (change)="saveSchema(type.id, value($event))"></textarea>
                    @if (invalid()[type.id]) {
                        <div class="invalid-feedback d-block" i18n="@@i18n.flow.invalidJson">This is not valid JSON.</div>
                    }
                </li>
            }
            <li class="list-group-item py-3">
                <div class="row g-2 align-items-center">
                    <div class="col-md-3"><input #key class="form-control form-control-sm" i18n-placeholder="@@i18n.flow.newJobTypeKey" placeholder="new job type key" /></div>
                    <div class="col-md-4"><input #name class="form-control form-control-sm" i18n-placeholder="@@i18n.common.name" placeholder="name" /></div>
                    <div class="col-md-5 text-end">
                        <i class="text-primary pointer" tabindex="0" i18n-ngbTooltip="@@i18n.flow.addJobType" ngbTooltip="add job type" (click)="add(key, name)" (keyup.enter)="add(key, name)">add</i>
                    </div>
                </div>
                <div class="text-muted small mt-2" i18n="@@i18n.flow.schemaHint">Field types: string, text, url (http/https), list (one entry per line; with "fields" a JSON list of objects), object (JSON). "required_without" names a field that makes this one optional. Review gates: gate keys of the current phase, comma-separated, opened as approvals when a job reports its result. New types start with an example field.</div>
            </li>
        </ul>
    `,
    imports: [NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowJobTypesSectionComponent extends FlowSectionBase {
    readonly invalid = signal<Dictionary<boolean>>({});

    pretty = (schema: unknown) => JSON.stringify(schema, null, 2);
    gateKeys = (raw: string) => {
        const keys = raw.split(',').map((_) => _.trim()).filter(Boolean);
        return keys.length ? keys : null;
    };

    saveSchema(id: number, raw: string) {
        try {
            const schema = JSON.parse(raw);
            this.invalid.update((_) => ({ ..._, [id]: false }));
            this.save('job-types', id, { input_schema: schema });
        } catch {
            this.invalid.update((_) => ({ ..._, [id]: true }));
        }
    }
    add(key: HTMLInputElement, name: HTMLInputElement) {
        this.create('job-types', { key: key.value.trim(), name: name.value.trim(), input_schema: EXAMPLE_SCHEMA }, () => {
            key.value = '';
            name.value = '';
        });
    }
}
