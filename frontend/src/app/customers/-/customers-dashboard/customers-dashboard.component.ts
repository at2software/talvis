import { Page } from '@models/http/http.talvis';
import { Router } from '@angular/router';
import { AfterViewInit, ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CompanyService } from '@models/company/company.service';
import { Observable } from 'rxjs';
import { span, StartEnd } from '@constants/constants';
import { DATESPAN_RANGE } from '@constants/date/dateSpanRange';
import { dayjs, Dayjs } from '@constants/date/dates';
import { Company } from '@models/company/company.model';
import { Project } from '@models/project/project.model';
import { Product } from '@models/product/product.model';
import { Serializable } from '@models/_core/serializable';
import { SortData } from '@app/app/table-controls/sort-data';
import { SortMode } from '@app/app/table-controls/sort-mode';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { HttpHeaders } from '@angular/common/http';
import { GlobalService } from '@models/global.service';
import { TableSearchSortBase } from '@app/app/table-controls/table-base/table-search-sort-base.component';
import { ProjectState } from '@models/project/project-state.model';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { CdkTableModule } from '@angular/cdk/table';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { MoneyPipe } from '@pipes/money.pipe';
import { ContinuousMarkerComponent } from '@shards/continuous/continuous.marker.component';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ProjectComponent } from '@shards/project/project.component';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { EnableTableExportDirective } from '@app/app/table-controls/enable-table-export.directive';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { Dictionary } from '@constants/constants';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customers-dashboard',
    templateUrl: './customers-dashboard.component.html',
    styleUrls: ['./customers-dashboard.component.scss'],
    imports: [StackedTableDirective, ToolbarComponent, EnableTableExportDirective, CdkTableModule, Nx, AvatarComponent, ProjectComponent, MoneyPipe, ContinuousMarkerComponent, FormsModule, DatePipe, ProjectComponent, NgxDaterangepickerMd, SearchInputComponent, EmptyStateComponent, GuidedTourComponent],
})
export class CustomersDashboardComponent extends TableSearchSortBase<Company> implements AfterViewInit {
    protected getItems(): Company[] {
        return this.companies;
    }

    hasInvoicesModule: boolean = false;

    displayedColumns = ['created_at', 'icon', 'name', 'projects'];

    hasLoaded = signal(false);
    companies: Company[] = [];

    revenueOn: boolean = false;
    onlyWithActiveProjects = signal(true);
    revenueSpan: StartEnd = new StartEnd();
    selUpdated: StartEnd = new StartEnd();
    revenueMin: number = 0;

    dateRangeFilterActive = signal(false);
    updatedAtFilterActive = signal(false);
    revenueFilterActive = signal(false);
    productFilterActive = signal(false);

    dateRange?: { startDate: Dayjs; endDate: Dayjs };
    updatedAtRange?: { startDate: Dayjs; endDate: Dayjs };
    revenue_min?: number;
    selectedProduct?: Product;

    ranges: Dictionary<[Dayjs, Dayjs]> = DATESPAN_RANGE;
    updatedAtRanges: Dictionary<[Dayjs, Dayjs]> = {};
    loadsum: number = 0;
    currentFilter: string = '';
    global = inject(GlobalService);

    observer!: Observable<Page<Company>>;
    onResult = (x: Company[]) => {
        this.hasLoaded.set(true);
        this.companies = this.companies.concat(x);
        this.refreshItems();
    };

    #companyService: CompanyService = inject(CompanyService);
    #router: Router = inject(Router);
    #inputModalService: InputModalService = inject(InputModalService);

    constructor() {
        super();
        this.hasInvoicesModule = this.global.user?.hasRole('invoicing') ?? false;
        if (this.hasInvoicesModule) {
            this.displayedColumns.push('revenue');
        }

        this.updatedAtRanges = {
            ...DATESPAN_RANGE,
            'Before 1 Year': [dayjs('1900-01-01'), dayjs().subtract(1, 'years')],
            'Before 2 Years': [dayjs('1900-01-01'), dayjs().subtract(2, 'years')],
            'Before 3 Years': [dayjs('1900-01-01'), dayjs().subtract(3, 'years')],
            'Before 5 Years': [dayjs('1900-01-01'), dayjs().subtract(5, 'years')],
            'Before 10 Years': [dayjs('1900-01-01'), dayjs().subtract(10, 'years')],
        };
    }

    filtersUpdated = (_e?: unknown) => {
        const filters = Object.assign({}, this.filters());
        const nextFilter = JSON.stringify(filters);
        if (nextFilter === this.currentFilter) return;
        this.currentFilter = nextFilter;
        this.companies = [];
        this.hasLoaded.set(false);
        this.observer = this.#companyService.indexPaginated(filters);
    };

    filters = () => {
        const filters: Dictionary = {
            onlyWithActiveProjects: this.onlyWithActiveProjects(),
            revenueOn: this.revenueOn,
            revenueSpan: span(this.revenueSpan),
            revenueMin: this.revenueMin,
        };

        if (this.dateRangeFilterActive() && this.dateRange) {
            if (this.dateRange.startDate) filters.created_from = this.dateRange.startDate.format('YYYY-MM-DD');
            if (this.dateRange.endDate) filters.created_to = this.dateRange.endDate.format('YYYY-MM-DD');
        }

        if (this.updatedAtFilterActive() && this.updatedAtRange) {
            if (this.updatedAtRange.startDate) filters.updated_from = this.updatedAtRange.startDate.format('YYYY-MM-DD');
            if (this.updatedAtRange.endDate) filters.updated_to = this.updatedAtRange.endDate.format('YYYY-MM-DD');
        }

        if (this.revenueFilterActive() && this.revenue_min !== undefined) {
            filters.revenue_min = this.revenue_min;
        }

        if (this.productFilterActive() && this.selectedProduct) {
            filters.product_id = this.selectedProduct.id;
        }

        if (this.sortData.sortMode !== SortMode.NONE) {
            filters.sort_by = this.sortData.key;
            filters.sort_direction = this.sortData.sortMode === SortMode.ASCENDING ? 'asc' : 'desc';
        }
        return filters;
    };

    ngAfterViewInit(): void {
        this.filtersUpdated(null);
    }

    onProductSelect = (selected: Serializable) => {
        const product = selected.assert(Product);
        if (!product) return;
        this.selectedProduct = product;
        this.filtersUpdated(null);
    };

    override sortBy(sortData: SortData): void {
        this.sortData = sortData;
        this.filtersUpdated(null);
    }

    override refreshItems(): void {
        this.sortedItems = this.companies;
    }

    sortByColumn(column: string): void {
        if (this.sortData.key === column) {
            this.sortData.sortMode = this.sortData.sortMode === SortMode.ASCENDING ? SortMode.DESCENDING : this.sortData.sortMode === SortMode.DESCENDING ? SortMode.NONE : SortMode.ASCENDING;
        } else {
            this.sortData.key = column;
            this.sortData.sortMode = SortMode.ASCENDING;
        }

        this.filtersUpdated(null);
    }

    getSortIcon(column: string): string {
        if (this.sortData.key !== column) return '';

        switch (this.sortData.sortMode) {
            case SortMode.ASCENDING:
                return '↑';
            case SortMode.DESCENDING:
                return '↓';
            default:
                return '';
        }
    }

    bubbleSizeFor = (p: Project) => {
        if (p.net < 1000) return 'bubble-sm';
        if (p.net < 10000) return 'bubble-md';
        if (p.net < 100000) return 'bubble-lg';
        return 'bubble-xl';
    };
    bubbleColorFor = (p: Project): string => {
        if (p.state.progress == ProjectState.ProgressPrepared) return 'bubble-darker';
        if (p.is_time_based) return 'bubble-time';
        return 'bubble-active';
    };

    httpOptions: { headers: HttpHeaders } = { headers: new HttpHeaders({ 'Access-Control-Allow-Origin': '*' }) };
    create = () => {
        this.#inputModalService.open($localize`:@@i18n.customers.company_name_or_url:Company name or URL`).confirmed(({ text }) => {
            this.#companyService.create(text).subscribe((x) => {
                this.#router.navigate(['/customers/' + x.id + '/cards']);
            });
        });
    };
}
