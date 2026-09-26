import { Company } from '@models/company/company.model';
import { ChangeDetectionStrategy, Component, effect, inject, linkedSignal, signal } from '@angular/core';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { AvatarComponent } from '@app/_shards/avatar/avatar.component';
import { SearchInputComponent } from '@app/_shards/search-input/search-input.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { RouterModule } from '@angular/router';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { GitlabAuditService } from '@models/gitlab-audit/gitlab-audit.service';
import { GitlabAuditProject } from '@models/gitlab-audit/gitlab-audit-project.model';
import { GitlabSchedule } from '@models/gitlab-audit/gitlab-schedule.model';
import { ProductService } from '@models/product/product.service';
import { ParamService } from '@models/param/param.service';
import { Param } from '@models/param/param.model';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalAuditPipelineComponent } from '@app/_modals/modal-audit-pipeline/modal-audit-pipeline.component';
import { ModalSearchComponent } from '@app/_modals/modal-search/modal-search.component';
import { ModalSelectInvoiceItemComponent } from '@app/_modals/modal-select-invoice-item/modal-select-invoice-item.component';
import { ModalCreateAuditInvoiceItemComponent } from '@app/_modals/modal-create-audit-invoice-item/modal-create-audit-invoice-item.component';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Product } from '@models/product/product.model';
import { Serializable } from '@models/_core/serializable';
import { Dictionary } from '@constants/constants';

const TALVIS_PREFIX = '[NEXUS] ';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'projects-audit',
    imports: [RouterModule, ToolbarComponent, EmptyStateComponent, AvatarComponent, SearchInputComponent, NgbTooltipModule, Nx, NComponent, AvatarComponent, SpinnerComponent],
    templateUrl: './projects-audit.component.html',
})
export class ProjectsAuditComponent {
    savingProduct = signal(false);

    #service = inject(GitlabAuditService);
    #factory = inject(PluginInstanceFactory);
    #http = inject(HttpClient);
    #modalBase = inject(ModalBaseService);
    #inputModal = inject(InputModalService);
    #ngbModal = inject(NgbModal);
    #productService = inject(ProductService);
    #paramService = inject(ParamService);

    readonly #projects = modelListResource(() => this.#service.index());
    readonly projects = linkedSignal(this.#projects.value);
    readonly loading = this.#projects.isLoading;

    readonly #defaultProductParam = modelResource(() => this.#paramService.show('params/AUDIT_DEFAULT_PRODUCT_ID'));
    readonly #storedDefaultProduct = modelResource(
        () => (this.#defaultProductParam.value()?.value as string) || undefined,
        (productId) => this.#productService.show(productId),
    );
    readonly defaultProduct = linkedSignal(this.#storedDefaultProduct.value);

    constructor() {
        effect(() => {
            this.projects().forEach((p) => this.#bindCallbacks(p));
            this.loadSchedules();
        });
    }

    load = () => this.#projects.reload();

    selectDefaultProduct(selected: Serializable) {
        const product = selected.assert(Product);
        if (!product) return;
        this.defaultProduct.set(product);
        this.savingProduct.set(true);
        Param.write('params/AUDIT_DEFAULT_PRODUCT_ID', product.id).subscribe({
            next: () => {
                this.savingProduct.set(false);
            },
            error: () => {
                this.savingProduct.set(false);
            },
        });
    }

    clearDefaultProduct() {
        this.defaultProduct.set(undefined);
        Param.write('params/AUDIT_DEFAULT_PRODUCT_ID', null).subscribe();
    }

    #enc(project: GitlabAuditProject) {
        return this.#factory.getPluginEncryptionsOfType('git').find((e) => project.gitlab_url.startsWith(e.value.url));
    }

    loadSchedules() {
        const projects = this.projects();
        projects.forEach((p) => {
            const enc = this.#enc(p);
            if (!enc) {
                p.var.noToken = true;
                return;
            }
            p.var.loading = true;
            const encoded = encodeURIComponent(p.namespace_with_path);
            this.#http
                .get<GitlabSchedule[]>(`${enc.value.url}api/v4/projects/${encoded}/pipeline_schedules`)
                .pipe(catchError(() => of([])))
                .subscribe((raw) => {
                    p.schedules = (raw ?? [])
                        .filter((_) => _.description?.startsWith(TALVIS_PREFIX))
                        .map((_) => this.#makeSchedule(_, p));
                    p.var.loading = false;
                });
        });
    }

    #makeSchedule(raw: GitlabSchedule, project: GitlabAuditProject): GitlabSchedule {
        const s = GitlabSchedule.fromJson(raw);
        s.var.onDelete = (schedule: GitlabSchedule, done?: () => void) => {
            const enc = this.#enc(project)!;
            const encoded = encodeURIComponent(project.namespace_with_path);
            this.#http.delete(`${enc.value.url}api/v4/projects/${encoded}/pipeline_schedules/${schedule.id}`).subscribe(() => {
                project.schedules = project.schedules.filter((sc) => sc.id !== schedule.id);
                done?.();
                if (!project.schedules.length) {
                    project.delete().subscribe(() => {
                        this.projects.set(this.projects().filter((p) => p.id !== project.id));
                    });
                }
            });
        };
        return s;
    }

    #bindCallbacks(p: GitlabAuditProject) {
        p.var.onRename = async (project: GitlabAuditProject) => {
            const result = await this.#inputModal.open('rename audit', false, undefined, project.project_name).catch(() => null);
            if (!result?.text?.trim()) return;
            project.update({ project_name: result.text.trim() }).subscribe(() => {
                project.project_name = result.text.trim();
            });
        };

        p.var.onLinkCompany = async (project: GitlabAuditProject) => {
            const selected = await this.#modalBase.open(ModalSearchComponent, 'Company', 'select company').catch(() => null);
            const company = selected?.assert(Company);
            if (!company) return;
            project.update({ company_id: company.id }).subscribe((updated) => {
                project.company_id = updated.company_id;
                project.company = updated.company ?? company;
            });
        };

        p.var.onUnlinkCompany = (project: GitlabAuditProject) => {
            project.update({ company_id: null }).subscribe(() => {
                project.company_id = undefined;
                project.company = undefined;
            });
        };

        p.var.onLinkInvoiceItem = async (project: GitlabAuditProject) => {
            const modalRef = this.#ngbModal.open(ModalSelectInvoiceItemComponent, { size: 'lg' });
            const item = await modalRef.result.catch(() => null);
            if (!item) return;
            project.update({ invoice_item_id: item.id }).subscribe((updated) => {
                project.invoice_item_id = updated.invoice_item_id;
                project.invoice_item = updated.invoice_item ?? item;
            });
        };

        p.var.onUnlinkInvoiceItem = (project: GitlabAuditProject) => {
            project.update({ invoice_item_id: null }).subscribe(() => {
                project.invoice_item_id = undefined;
                project.invoice_item = undefined;
            });
        };

        p.var.onCreateInvoiceItem = async (project: GitlabAuditProject) => {
            const company = project.company;
            if (!company) return;
            const item = await this.#modalBase.open(ModalCreateAuditInvoiceItemComponent, company, this.defaultProduct()).catch(() => null);
            if (!item) return;
            project.update({ invoice_item_id: item.id }).subscribe((updated) => {
                project.invoice_item_id = updated.invoice_item_id;
                project.invoice_item = updated.invoice_item ?? item;
            });
        };
    }

    openAddModal() {
        this.#modalBase
            .open(ModalAuditPipelineComponent)
            .then(() => this.load())
            .catch(() => {
                // Modal dismissed
            });
    }

    stageName(description: string): string {
        return description.startsWith(TALVIS_PREFIX) ? description.slice(TALVIS_PREFIX.length) : description;
    }

    cronLabel(cron: string): string {
        const labels: Dictionary<string> = {
            '0 0 * * *': 'daily',
            '0 0 * * 0': 'weekly',
            '0 0 1 * *': 'monthly',
        };
        return labels[cron] ?? cron;
    }
}
