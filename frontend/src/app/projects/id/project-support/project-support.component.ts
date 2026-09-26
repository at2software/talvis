import { CdkTableModule } from '@angular/cdk/table';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, ElementRef, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { StartEnd } from '@constants/constants';
import { DATESPAN_RANGE } from '@constants/date/dateSpanRange';
import { AffixInputDirective } from '@directives/affix-input.directive';
import { Focus } from '@models/focus/focus.model';
import { FocusService } from '@models/focus/focus.service';
import { GlobalService } from '@models/global.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { Product } from '@models/product/product.model';
import { ProductService } from '@models/product/product.service';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { ExtIssueResolverService, ExtIssueRef } from '@models/ext-issue/ext-issue-resolver.service';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MoneyPipe } from '@pipes/money.pipe';
import { Dayjs, dayjsMin, dayjsMax } from '@constants/date/dates';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { map, Subscription } from 'rxjs';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-support',
    imports: [StackedTableDirective, AvatarComponent, CdkTableModule, DatePipe, DecimalPipe, FormsModule, RouterLink, Nx, NComponent, AffixInputDirective, NgbTooltipModule, NgxDaterangepickerMd, EmptyStateComponent, SearchInputComponent, SpinnerComponent, MoneyPipe],
    templateUrl: './project-support.component.html',
    styleUrl: './project-support.component.scss',
})
export class ProjectSupportComponent {

    static readonly isPendingSupportItem = (_: InvoiceItem) => _.stage === 1 && !_.invoice_id;

    #focusService = inject(FocusService);
    #invoiceItemService = inject(InvoiceItemService);
    #productService = inject(ProductService);
    #projectService = inject(ProjectService);
    #router = inject(Router);
    #extIssueResolver = inject(ExtIssueResolverService);
    #pluginFactory = inject(PluginInstanceFactory);
    #destroyRef = inject(DestroyRef);
    global = inject(GlobalService);

    parent = input.required<Project | Company>();
    parentReloadRequested = output<void>();

    readonly ranges = DATESPAN_RANGE;
    span = signal<StartEnd>(new StartEnd());
    selectionSum = signal<string>('0');
    selectionDescription = signal<string>('');
    selection = signal<Focus[]>([]);

    extIssues = signal<Record<string, ExtIssueRef>>({});

    readonly supportItemColumns = ['text', 'net'];

    readonly isProject = computed(() => this.parent() instanceof Project);
    readonly hasIssueTracker = computed(() => (this.isProject() ? this.#pluginFactory.getTaskInstances(this.parent()).length > 0 : false));
    readonly fociColumns = computed(() => (this.hasIssueTracker() ? ['user_id', 'started_at', 'comment', 'ext_issue', 'duration'] : ['user_id', 'started_at', 'comment', 'duration']));
    readonly vatId = computed(() => (this.parent() instanceof Project ? (this.parent() as Project).company?.vat_id : (this.parent() as Company).vat_id));
    readonly invoicingRoute = computed(() => (this.isProject() ? ['..', 'invoicing', 'support'] : ['..', 'billing']));

    readonly descField = viewChild<ElementRef>('desc');
    readonly fociSpinner = viewChild<SpinnerComponent>('fociSpinner');

    #selectionSub: Subscription;

    readonly #parentId = computed(() => this.parent().id);

    readonly #defaultProduct = modelResource(
        () => (this.parent() instanceof Company ? (this.parent() as Company).default_product_id || undefined : undefined),
        (productId) => this.#productService.show(productId),
    );
    readonly selectionProduct = linkedSignal<Product | undefined>(() => {
        const parent = this.parent();
        return parent instanceof Project ? parent.product : this.#defaultProduct.value();
    });

    readonly #foci = modelListResource(this.#parentId, () => this.#focusService.uninvoicedFoci(this.parent()));
    readonly allFoci = linkedSignal(this.#foci.value);
    readonly foci = computed(() => {
        const span = this.span();
        if (!span?.startDate || !span?.endDate) return this.allFoci();
        return this.allFoci().filter((_) => span.startDate!.diff(_.momentStarted(), 'seconds') < 0 && span.endDate!.diff(_.momentStarted(), 'seconds') >= 0);
    });

    readonly #supportItems = modelListResource(this.#parentId, () =>
        this.#invoiceItemService.getInvoiceItems(this.parent(), { append: 'my_prediction', with: 'predictions' }).pipe(map((items: InvoiceItem[]) => items.filter(ProjectSupportComponent.isPendingSupportItem))),
    );
    readonly supportItems = linkedSignal(this.#supportItems.value);

    constructor() {
        effect(() => {
            if (this.#foci.isLoading()) this.fociSpinner()?.show();
            else this.fociSpinner()?.hide();
        });
        effect(() => this.#extIssueResolver.resolveRows(this.isProject() ? (this.parent() as Project) : undefined, this.allFoci(), this.extIssues));

        this.#selectionSub = this.global.onObjectSelected.subscribe((_) => this.#onSelection(_));
        this.#destroyRef.onDestroy(() => {
            this.global.registerSelectedObject(null, false);
            this.#selectionSub.unsubscribe();
        });
    }

    onFociActionsResolved = () => this.#foci.reload();

    #onSelection(_: unknown) {
        setTimeout(() => {
            const selected = [_].flat();
            const foci = (selected.length && selected[0] instanceof Focus ? selected : []) as Focus[];
            this.selection.set(foci);
            this.selectionSum.set(foci.reduce((b: number, a: Focus) => a.duration + b, 0).toString());
            foci.forEach((s: Focus) => {
                if (s.comment?.length) {
                    this.selectionDescription.set(s.comment);
                }
            });
            if (foci.length) this.descField()?.nativeElement.focus();
        });
    }

    onCreateNewSupportItem() {
        const sel = this.selection();
        let min: Dayjs | undefined = undefined;
        let max: Dayjs | undefined = undefined;
        const selectedIds = sel.map((_) => {
            const ca = _.momentStarted();
            min = min ? dayjsMin(ca, min) : ca;
            max = max ? dayjsMax(ca, max) : ca;
            return _.id;
        });
        setTimeout(() => {
            this.selection.set([]);
            this.allFoci.update((f) => f.filter((_: Focus) => !selectedIds.includes(_.id)));
        });
        const product = this.selectionProduct();
        if (product) {
            let desc = this.selectionDescription();
            desc += '<br>' + $localize`:@@i18n.invoices.performancePeriod:performance period` + ' ' + min!.format('DD.MM.YYYY') + ' - ' + max!.format('DD.MM.YYYY');
            this.#focusService.createInvoiceItemsFor(this.parent(), selectedIds, desc, parseFloat(this.selectionSum()), product.id).subscribe((newItem) => {
                if (ProjectSupportComponent.isPendingSupportItem(newItem)) this.supportItems.update((items) => [...items, newItem]);
                this.parentReloadRequested.emit();
            });
        }
    }

    onMoveSupportToCustomer() {
        const project = this.parent() as Project;
        this.#projectService.moveSupportToCustomer(project).subscribe(() => this.#router.navigate(['/customers/' + project.company_id + '/billing']));
    }

    onProductSelect(selected: Serializable) {
        const product = selected.assert(Product);
        if (!product) return;
        this.selectionProduct.set(product);
        this.descField()?.nativeElement.focus();
    }
}
