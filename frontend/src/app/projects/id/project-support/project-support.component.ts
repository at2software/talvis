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
import { InvoiceItemStage } from '@enums/invoice-item.stage';
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
    imports: [StackedTableDirective, AvatarComponent, CdkTableModule, DatePipe, DecimalPipe, FormsModule, RouterLink, Nx, NComponent, AffixInputDirective, NgbTooltipModule, NgxDaterangepickerMd, SearchInputComponent, SpinnerComponent, MoneyPipe],
    templateUrl: './project-support.component.html',
    styleUrl: './project-support.component.scss',
})
export class ProjectSupportComponent {

    static readonly isPendingSupportItem = (_: InvoiceItem) => _.isOpenInStage(InvoiceItemStage.Support);

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
    readonly isVatExempt = computed(() => (this.parent() instanceof Project ? (this.parent() as Project).company : (this.parent() as Company))?.isVatExcempt() ?? false);
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
    readonly fociLoading = this.#foci.isLoading;
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
    readonly supportItemsLoaded = this.#supportItems.hasValue;

    /** open items the selected foci can be linked to; subscription templates themselves are no target */
    readonly targetCandidates = computed(() => this.supportItems().filter((_) => !_.isRepeating()));
    /** null = create a new item from the selection */
    readonly selectionTarget = signal<InvoiceItem | null>(null);
    readonly compareTargets = (a: InvoiceItem | null, b: InvoiceItem | null) => (a?.id ?? null) === (b?.id ?? null);

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
            const wasEmpty = this.selection().length === 0;
            this.selection.set(foci);
            if (!foci.length) this.selectionTarget.set(null);
            else if (wasEmpty) this.selectionTarget.set(this.preselectTarget());
            this.selectionSum.set(Focus.totalDuration(foci).toString());
            foci.forEach((s: Focus) => {
                if (s.comment?.length) {
                    this.selectionDescription.set(s.comment);
                }
            });
            if (foci.length) this.descField()?.nativeElement.focus({ preventScroll: true });
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

    /** in hyper care, the most recent subscription spawn is the natural target for support time */
    preselectTarget(): InvoiceItem | null {
        const parent = this.parent();
        if (!(parent instanceof Project) || !parent.isInHyperCare()) return null;
        const spawns = this.targetCandidates().filter((_) => _.isRecurrenceSpawn());
        if (!spawns.length) return null;
        const age = (_: InvoiceItem) => _.createdAt().valueOf() || 0;
        return spawns.reduce((latest, _) => (age(_) > age(latest) || (age(_) === age(latest) && +_.id > +latest.id) ? _ : latest));
    }

    targetLabel(item: InvoiceItem): string {
        const text = (new DOMParser().parseFromString(item.text ?? '', 'text/html').body.textContent ?? '').replace(/\s+/g, ' ').trim();
        return text.length > 40 ? text.slice(0, 39) + '…' : text;
    }

    onLinkToSupportItem() {
        const target = this.selectionTarget();
        if (!target) return;
        const selectedIds = this.selection().map((_) => _.id);
        if (!selectedIds.length) return;
        this.selection.set([]);
        this.selectionTarget.set(null);
        this.allFoci.update((f) => f.filter((_: Focus) => !selectedIds.includes(_.id)));
        this.#focusService.linkToInvoiceItem(this.parent(), selectedIds, target.id).subscribe({
            next: (item) => {
                this.supportItems.update((items) => items.map((_) => (_.id === item.id ? item : _)));
                this.parentReloadRequested.emit();
            },
            error: () => this.#foci.reload(),
        });
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
