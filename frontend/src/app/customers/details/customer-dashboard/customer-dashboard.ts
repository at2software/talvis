import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { tracked } from '@constants/tracked';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CompanyService } from '@models/company/company.service';
import { Invoice } from '@models/invoice/invoice.model';
import { CompanyContact } from '@models/company/company-contact.model';
import { GlobalService } from '@models/global.service';
import { EchartsRangeCardComponent } from '@charts/echarts-card/echarts-range-card.component';
import { Product } from '@models/product/product.model';
import { ProductService } from '@models/product/product.service';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';
import { Serializable } from '@models/_core/serializable';
import { ProjectService } from '@models/project/project.service';
import { InvoiceService } from '@models/invoice/invoice.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { ListGroupItemContactComponent } from '@app/customers/_shards/list-group-item-contact/list-group-item-contact.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { NgbTooltipModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { CustomerQuickstatsComponent } from '@app/customers/_shards/customer-quickstats/customer-quickstats.component';
import { ProjectsTableComponent } from '@app/projects/_shards/projects-table/projects-table.component';
import { InvoicesTable } from '@app/invoices/_shards/invoices-table/invoices-table';
import { CustomerInitiativesComponent } from '@app/customers/_shards/customer-initiatives/customer-initiatives.component';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { ProjectTeamPlanningComponent } from '@app/projects/_shards/project-team-planning/project-team-planning.component';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { SafePipe } from '@pipes/safe.pipe';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { MoneyPipe } from '@pipes/money.pipe';
import { MediaPreviewComponent } from '@app/projects/id/project-media/media-preview/media-preview.component';
import { CompanyLocaleSelectorComponent } from '@app/customers/_shards/company-locale-selector/company-locale-selector.component';
import { CustomerPredictionBiasChartComponent } from '@app/customers/_shards/customer-prediction-bias-chart/customer-prediction-bias-chart.component';
import { WorkloadTimelineChartComponent } from '@shards/workload-timeline-chart/workload-timeline-chart.component';
import { Dictionary } from '@constants/constants';
import { MlReliabilityDirective } from '@directives/ml-reliability.directive';
import { modelResource } from '@models/http/model-resource';
import { RECURRENCES } from '@enums/recurrence.type';

@Component({
    selector: 'customer-dashboard',
    templateUrl: './customer-dashboard.html',
    imports: [ToolbarComponent, ScrollbarComponent, ListGroupItemContactComponent, SearchInputComponent, NgbTooltipModule, NgbDropdownModule, FormsModule, RouterModule, CustomerQuickstatsComponent, MediaPreviewComponent, ProjectsTableComponent, InvoicesTable, EchartsRangeCardComponent, Nx, NComponent, ProjectTeamPlanningComponent, HotkeyDirective, SafePipe, PercentPipe, DecimalPipe, MoneyPipe, CompanyLocaleSelectorComponent, CustomerInitiativesComponent, CustomerPredictionBiasChartComponent, WorkloadTimelineChartComponent, MlReliabilityDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerDashboard {
    static readonly VISIBLE_CONTACTS = 5;

    #parent = inject(CustomerDetailGuard);
    #global = inject(GlobalService);
    #projectService = inject(ProjectService);
    #invoiceService = inject(InvoiceService);
    #productService = inject(ProductService);
    #companyService = inject(CompanyService);
    #router = inject(Router);
    #route = inject(ActivatedRoute);

    company = tracked(this.#parent.object);

    showDefaultProduct = signal(false);
    showLeadSource = signal(false);

    readonly globalUserHasInvoicingRole = this.#global.user?.hasRole('invoicing') ?? false;
    readonly recurrences = RECURRENCES;

    readonly #invoices = modelResource(
        () => (this.globalUserHasInvoicingRole ? this.#parent.object()?.id || undefined : undefined),
        (companyId) => this.#invoiceService.index({ company_id: companyId, onlyUnpaid: 'true' }),
    );
    readonly invoices = computed<Invoice[]>(() => this.#invoices.value() ?? []);

    readonly #defaultProduct = modelResource(
        () => this.#parent.object()?.default_product_id || undefined,
        (productId) => this.#productService.show(productId),
    );
    readonly product = linkedSignal(() => this.#defaultProduct.value());

    readonly #activeContacts = computed<CompanyContact[]>(() => this.company().employees.filter((_) => !_.is_retired).sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite)));
    readonly contactPersons = computed<CompanyContact[]>(() => this.#activeContacts().slice(0, CustomerDashboard.VISIBLE_CONTACTS));
    readonly hiddenContactCount = computed(() => this.#activeContacts().length - this.contactPersons().length);

    reload = () => this.#parent.reload();

    onAddProject = () => this.#projectService.promptAddProject(this.company().id);

    onAddContact = () =>
        this.#companyService.promptAddEmployee(this.company(), (created) => {
            this.#parent.touch();
            this.#router.navigate(['contacts', created.id], { relativeTo: this.#route });
        });

    onProductSelect = (selected: Serializable) => {
        const product = selected.assert(Product);
        if (!product) return;
        const company = this.company();
        company.default_product_id = product.id;
        this.product.set(product);
        company.update({ default_product_id: product.id }).subscribe();
    };

    onLeadSourceSelected = (_: Serializable) => {
        const company = this.company();
        company.update({ source_type: 'App\\Models\\' + _.class, source_id: _.id }).subscribe((r) => company.setSource(r as unknown as Dictionary));
    };
}
