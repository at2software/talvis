import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { HttpErrorResponse } from '@angular/common/http';
import { GitlabAuditService } from '@models/gitlab-audit/gitlab-audit.service';
import { NComponent } from '@app/_shards/n/n.component';
import { SearchInputComponent } from '@app/_shards/search-input/search-input.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { ModalBaseComponent } from '../modal-base.component';

const CRON_PRESETS = [
    { label: $localize`:@@i18n.common.daily:daily`, cron: '0 0 * * *' },
    { label: $localize`:@@i18n.common.weekly:weekly`, cron: '0 0 * * 0' },
    { label: $localize`:@@i18n.common.monthly:monthly`, cron: '0 0 1 * *' },
];

interface AuditCandidates {
    gitlab_url: string;
    project: { id: number; name: string; path_with_namespace: string };
    environments: string[];
    environment: string;
    deployment: { id: number; ref: string; sha: string; deployable: { pipeline: { id: number }; finished_at: string } } | null;
    jobs: { id: number; name: string; status: string }[];
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-audit-pipeline',
    imports: [FormsModule, NComponent, SearchInputComponent, SpinnerComponent],
    templateUrl: './modal-audit-pipeline.component.html',
})
export class ModalAuditPipelineComponent extends ModalBaseComponent<boolean> {
    init(): void { /* nothing to seed */ }
    onSuccess = () => true;

    activeModal = inject(NgbActiveModal);
    #service    = inject(GitlabAuditService);

    projectUrl         = signal('');
    selectedCompany    = signal<Company | undefined>(undefined);
    checking           = signal(false);
    creating           = signal(false);
    error              = signal('');
    candidates         = signal<AuditCandidates | null>(null);
    selectedJobs       = signal<Dictionary<boolean>>({});
    selectedCron       = signal(CRON_PRESETS[1].cron);
    customCron         = signal('');
    isCustomCron       = signal(false);
    readonly cronPresets = CRON_PRESETS;

    selectCompany(selected: Serializable) {
        this.selectedCompany.set(selected.assert(Company));
    }

    check(environment?: string) {
        this.error.set('');
        this.checking.set(true);
        this.#service.get('gitlab-audit/candidates', { url: this.projectUrl(), environment }, Object).subscribe({
            next: (candidates: AuditCandidates) => {
                this.candidates.set(candidates);
                this.selectedJobs.set(Object.fromEntries(candidates.jobs.map((_) => [_.name, true])));
                this.checking.set(false);
            },
            error: (e: HttpErrorResponse) => {
                this.candidates.set(null);
                this.error.set(e.error?.message ?? 'Project lookup failed.');
                this.checking.set(false);
            },
        });
    }

    setJob(job: string, value: boolean) {
        this.selectedJobs.update((s) => ({ ...s, [job]: value }));
    }

    readonly cron = computed(() => (this.isCustomCron() ? this.customCron() : this.selectedCron()));
    readonly selectedList = computed(() => (this.candidates()?.jobs ?? []).map((_) => _.name).filter((_) => this.selectedJobs()[_]));
    readonly canCreate = computed(() => !!(this.candidates()?.deployment && this.selectedList().length && this.cron()));

    create() {
        if (!this.canCreate()) return;
        const { gitlab_url, project, environment } = this.candidates()!;
        this.creating.set(true);
        this.#service
            .post('gitlab-audit', {
                gitlab_url,
                namespace_with_path: project.path_with_namespace,
                project_name: project.name,
                gitlab_project_id: project.id,
                company_id: this.selectedCompany()?.id ?? null,
                environment,
                cron: this.cron(),
                jobs: this.selectedList(),
            })
            .subscribe({
                next: () => {
                    this.creating.set(false);
                    this.activeModal.close(true);
                },
                error: () => this.creating.set(false),
            });
    }
}
