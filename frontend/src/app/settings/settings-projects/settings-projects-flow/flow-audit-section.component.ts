import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { FlowAdminService } from '@models/flow/flow-admin.service';
import type { FlowAuditEntryDto } from '@models/_core/api-response';

@Component({
    selector: 'flow-audit-section',
    template: `
        <div class="card-body d-flex flex-wrap gap-2 border-bottom">
            <select class="form-select form-select-sm w-auto" (change)="filter('subject', $any($event.target).value)">
                <option value="" i18n="@@i18n.flow.allSubjects">all subjects</option>
                @for (type of subjectTypes(); track type) {
                    <option [value]="type">{{ type }}</option>
                }
            </select>
            <select class="form-select form-select-sm w-auto" (change)="filter('actor_type', $any($event.target).value)">
                <option value="" i18n="@@i18n.flow.allActors">users and machines</option>
                <option value="user" i18n="@@i18n.flow.users">users</option>
                <option value="machine" i18n="@@i18n.flow.machines">machines</option>
                <option value="system" i18n="@@i18n.flow.system">system</option>
            </select>
            <select class="form-select form-select-sm w-auto" (change)="filter('action', $any($event.target).value)">
                <option value="" i18n="@@i18n.flow.allActions">all actions</option>
                <option value="project." i18n="@@i18n.flow.actionProject">project state changes</option>
                <option value="approval." i18n="@@i18n.flow.actionApproval">approvals</option>
                <option value="job." i18n="@@i18n.flow.actionJob">jobs</option>
                <option value="config." i18n="@@i18n.flow.actionConfig">configuration</option>
            </select>
        </div>
        @if (loading()) {
            <spinner class="p-4"></spinner>
        } @else {
            <table class="table table-hover mb-0 align-middle">
                <thead>
                    <tr>
                        <th i18n="@@i18n.common.date">date</th>
                        <th i18n="@@i18n.flow.action">action</th>
                        <th i18n="@@i18n.flow.subject">subject</th>
                        <th i18n="@@i18n.flow.actor">actor</th>
                        <th i18n="@@i18n.flow.details">details</th>
                    </tr>
                </thead>
                <tbody>
                    @for (entry of entries(); track entry.id) {
                        <tr>
                            <td class="text-nowrap small">{{ entry.created_at | date: 'dd.MM.yy HH:mm:ss' }}</td>
                            <td><span class="badge bg-dark">{{ entry.action }}</span></td>
                            <td>
                                <div>{{ entry.subject_label }}</div>
                                <small class="text-muted">{{ entry.subject_type }} #{{ entry.subject_id }}</small>
                            </td>
                            <td class="text-nowrap">
                                <i class="me-1 text-muted" [ngbTooltip]="entry.actor_type">{{ actorIcon[entry.actor_type] }}</i>
                                {{ entry.actor_name ?? '–' }}
                            </td>
                            <td>
                                @if (entry.payload) {
                                    <details>
                                        <summary class="text-primary pointer small" i18n="@@i18n.flow.showDetails">show</summary>
                                        <pre class="small mb-0">{{ entry.payload | json }}</pre>
                                    </details>
                                }
                            </td>
                        </tr>
                    } @empty {
                        <tr>
                            <td colspan="5" class="text-muted" i18n="@@i18n.flow.auditEmpty">nothing recorded yet</td>
                        </tr>
                    }
                </tbody>
            </table>
            @if (lastPage() > 1) {
                <div class="card-footer d-flex align-items-center gap-2">
                    <span class="flex-fill text-muted">{{ total() }}</span>
                    <button type="button" class="btn btn-sm btn-plain text-primary" [disabled]="page() <= 1" (click)="turnPage(-1)" i18n="@@i18n.common.back">back</button>
                    <span>{{ page() }} / {{ lastPage() }}</span>
                    <button type="button" class="btn btn-sm btn-plain text-primary" [disabled]="page() >= lastPage()" (click)="turnPage(1)" i18n="@@i18n.common.next">next</button>
                </div>
            }
        }
    `,
    imports: [DatePipe, JsonPipe, NgbTooltipModule, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowAuditSectionComponent {
    #service = inject(FlowAdminService);

    readonly actorIcon: Record<FlowAuditEntryDto['actor_type'], string> = { user: 'person', machine: 'smart_toy', system: 'settings' };
    readonly filters = signal<Record<string, string>>({});
    readonly page = signal(1);

    readonly #subjectTypes = modelListResource(() => this.#service.auditSubjectTypes());
    readonly subjectTypes = this.#subjectTypes.value;
    readonly #audit = modelResource(
        () => ({ ...this.filters(), page: this.page() }),
        (params) => this.#service.audit(Object.fromEntries(Object.entries(params).filter(([, value]) => String(value) !== ''))),
    );
    readonly loading = this.#audit.isLoading;
    readonly entries = computed(() => this.#audit.value()?.data ?? []);
    readonly lastPage = computed(() => this.#audit.value()?.last_page ?? 1);
    readonly total = computed(() => this.#audit.value()?.total ?? 0);

    filter(key: string, value: string) {
        this.page.set(1);
        this.filters.update((_) => ({ ..._, [key]: value }));
    }
    turnPage(delta: number) {
        this.page.update((_) => Math.min(Math.max(_ + delta, 1), this.lastPage()));
    }
}
