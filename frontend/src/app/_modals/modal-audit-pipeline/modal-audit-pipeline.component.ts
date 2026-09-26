import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { HttpClient } from '@angular/common/http';
import { forkJoin, switchMap, tap } from 'rxjs';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { GitlabAuditService } from '@models/gitlab-audit/gitlab-audit.service';
import { NComponent } from '@app/_shards/n/n.component';
import { SearchInputComponent } from '@app/_shards/search-input/search-input.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { GitlabProjectDto } from '@models/_core/api-response';
import { ModalBaseComponent } from '../modal-base.component';

const TALVIS_PREFIX = '[NEXUS] ';

const CRON_PRESETS = [
    { label: $localize`:@@i18n.common.daily:daily`, cron: '0 0 * * *' },
    { label: $localize`:@@i18n.common.weekly:weekly`, cron: '0 0 * * 0' },
    { label: $localize`:@@i18n.common.monthly:monthly`, cron: '0 0 1 * *' },
];

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
    #http       = inject(HttpClient);
    #factory    = inject(PluginInstanceFactory);
    #service    = inject(GitlabAuditService);

    projectUrl      = signal('');
    selectedCompany = signal<Company | undefined>(undefined);
    checking        = signal(false);
    creating        = signal(false);
    error           = signal('');
    checkedProject  = signal<GitlabProjectDto | null>(null);
    stages          = signal<string[]>([]);
    selectedStages  = signal<Dictionary<boolean>>({});
    branch          = signal('main');
    selectedCron    = signal(CRON_PRESETS[1].cron);
    customCron      = signal('');
    isCustomCron    = signal(false);
    readonly cronPresets = CRON_PRESETS;


    selectCompany(selected: Serializable) {
        this.selectedCompany.set(selected.assert(Company));
    }

    get #enc() {
        return this.#factory.getPluginEncryptionsOfType('git').find((e) => this.projectUrl().startsWith(e.value.url));
    }

    check() {
        this.error.set('');
        this.checkedProject.set(null);
        this.stages.set([]);
        const enc = this.#enc;
        if (!enc) {
            this.error.set('No GitLab token found for this URL.');
            return;
        }
        const path = encodeURIComponent(this.projectUrl().slice(enc.value.url.length).replace(/\/$/, ''));
        const base = enc.value.url + 'api/v4/';
        this.checking.set(true);
        this.#http
            .get<GitlabProjectDto>(`${base}projects/${path}`)
            .pipe(
                tap((project) => {
                    this.checkedProject.set(project);
                    this.branch.set(project.default_branch ?? 'main');
                }),
                switchMap((project) =>
                    this.#http.get(`${base}projects/${project.id}/repository/files/.gitlab-ci.yml/raw`, {
                        responseType: 'text',
                        params: { ref: this.branch() },
                    }),
                ),
            )
            .subscribe({
                next: (yaml) => {
                    const stages = this.#parseJobs(yaml as string);
                    this.stages.set(stages);
                    this.selectedStages.set(Object.fromEntries(stages.map((s) => [s, true])));
                    this.checking.set(false);
                },
                error: () => {
                    this.error.set(this.checkedProject() ? 'Could not fetch .gitlab-ci.yml — check the repository has one.' : 'Project not found or access denied.');
                    this.checking.set(false);
                },
            });
    }

    #parseJobs(yaml: string): string[] {
        const reserved = new Set(['stages', 'variables', 'include', 'default', 'workflow', 'image', 'services', 'cache', 'before_script', 'after_script']);
        return yaml
            .split('\n')
            .map((l) => l.match(/^([a-zA-Z][a-zA-Z0-9_-]*):\s*$/))
            .filter((m): m is RegExpMatchArray => !!m && !reserved.has(m[1]))
            .map((m) => m[1]);
    }

    setStage(stage: string, value: boolean) {
        this.selectedStages.update((s) => ({ ...s, [stage]: value }));
    }

    readonly cron = computed(() => (this.isCustomCron() ? this.customCron() : this.selectedCron()));
    readonly selectedList = computed(() => this.stages().filter((s) => this.selectedStages()[s]));
    readonly canCreate = computed(() => !!(this.checkedProject() && this.selectedList().length && this.cron()));

    create() {
        if (!this.canCreate()) return;
        const enc = this.#enc!;
        const project = this.checkedProject()!;
        const base = enc.value.url + 'api/v4/';
        const id = project.id;
        const cron = this.cron();
        const ref = this.branch();
        this.creating.set(true);
        forkJoin(
            this.selectedList().map((stage) =>
                this.#http.post(`${base}projects/${id}/pipeline_schedules`, {
                    description: TALVIS_PREFIX + stage,
                    ref,
                    cron,
                    active: true,
                }),
            ),
        )
            .pipe(
                switchMap(() =>
                    this.#service.post('gitlab-audit', {
                        gitlab_url: enc.value.url,
                        namespace_with_path: project.path_with_namespace,
                        project_name: project.name,
                        gitlab_project_id: project.id,
                        company_id: this.selectedCompany()?.id ?? null,
                    }),
                ),
            )
            .subscribe({
                next: () => {
                    this.creating.set(false);
                    this.activeModal.close(true);
                },
                error: () => {
                    this.creating.set(false);
                },
            });
    }
}
