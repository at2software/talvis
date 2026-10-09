import { ChangeDetectionStrategy, Component, ElementRef, inject, input, computed, linkedSignal, signal, viewChild } from '@angular/core';
import { map } from 'rxjs';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { GlobalService } from '@models/global.service';
import { Project } from '@models/project/project.model';
import { Focus } from '@models/focus/focus.model';
import { FocusService } from '@models/focus/focus.service';
import { User } from '@models/user/user.model';
import { Product } from '@models/product/product.model';
import { Serializable } from '@models/_core/serializable';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { Company } from '@models/company/company.model';
import { Dayjs, dayjsMin, dayjsMax } from '@constants/date/dates';
import { ProductService } from '@models/product/product.service';
import { DATESPAN_RANGE } from '@constants/date/dateSpanRange';
import { StartEnd } from '@constants/constants';
import { NgbDateAdapter, NgbDatepickerModule } from '@ng-bootstrap/ng-bootstrap';
import { NgbDateUnixAdapter } from '@constants/date/ngb-date-to-unix-adapter';
import { Router, RouterModule } from '@angular/router';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { CdkTableModule } from '@angular/cdk/table';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { NComponent } from '@shards/n/n.component';
import { MoneyPipe } from '@pipes/money.pipe';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ProjectComponent } from '@shards/project/project.component';
import { SafePipe } from '@pipes/safe.pipe';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-billing',
    templateUrl: './project-billing.component.html',
    styleUrls: ['./project-billing.component.scss'],
    providers: [{ provide: NgbDateAdapter, useClass: NgbDateUnixAdapter }],
    imports: [StackedTableDirective, EmptyStateComponent, DatePipe, DecimalPipe, FormsModule, NgxDaterangepickerMd, CdkTableModule, SearchInputComponent, NgbDatepickerModule, NComponent, RouterModule, MoneyPipe, Nx, NComponent, AvatarComponent, ProjectComponent, SafePipe],
})
export class ProjectBillingComponent {
    #global             = inject(GlobalService);
    #productService     = inject(ProductService);
    #focusService       = inject(FocusService);
    #invoiceItemService = inject(InvoiceItemService);
    #router             = inject(Router);

    parent = input.required<Project | Company>();
    protected readonly descField = viewChild<ElementRef>('desc');

    readonly ranges: typeof DATESPAN_RANGE = DATESPAN_RANGE;
    readonly fociColumns = ['user_id', 'started_at', 'duration', 'comment'];

    span                 = signal<StartEnd | undefined>(undefined);
    selectionSum         = signal(0);
    selectionDescription = signal('');
    selection            = signal<Focus[]>([]);

    isProject = computed(() => this.parent() instanceof Project);
    company = computed((): Company => (this.isProject() ? (this.parent() as Project).company : (this.parent() as Company)));

    readonly #parentId = computed(() => this.parent().id);

    readonly #defaultProduct = modelResource(
        () => {
            const parent = this.parent();
            return (parent instanceof Project ? parent.product_id : parent.default_product_id) || undefined;
        },
        (productId) => this.#productService.show(productId),
    );
    readonly selectionProduct = linkedSignal(this.#defaultProduct.value);

    readonly #allFoci = modelListResource(this.#parentId, () => this.#focusService.uninvoicedFoci(this.parent()));
    readonly allFoci = linkedSignal(this.#allFoci.value);

    readonly #items = modelListResource(this.#parentId, () => this.#invoiceItemService.getSupportItems(this.parent()).pipe(map((data) => data.filter((x) => x.type == 0))));
    readonly items = linkedSignal(this.#items.value);

    foci = computed(() => {
        const s = this.span();
        return s?.startDate && s?.endDate
            ? Focus.filterByDateRange(this.allFoci(), s.startDate, s.endDate)
            : this.allFoci();
    });

    constructor() {
        this.#global.onObjectSelected.pipe(takeUntilDestroyed()).subscribe((_) => this.#onSelection(_));
    }

    #onSelection(_: unknown) {
        const selected = [_].flat();
        const sel = selected.length && selected[0] instanceof Focus ? (selected as Focus[]) : [];
        this.selection.set(sel);
        this.selectionSum.set(sel.reduce((b: number, a: Focus) => a.duration + b, 0));
        sel.forEach((s: Focus) => {
            if (s.comment?.length) {
                this.selectionDescription.set(s.comment);
            }
        });
        if (sel.length) this.descField()?.nativeElement.focus({ preventScroll: true });
    }

    readonly userIconFor = (user_id: string) => User.iconPathFor(user_id);

    onProductSelect(selected: Serializable) {
        const product = selected.assert(Product);
        if (!product) return;
        this.selectionProduct.set(product);
        const parent = this.parent();
        if (parent instanceof Project) {
            parent.product_id = product.id;
            parent.update({ product_id: product.id }).subscribe();
        }
        this.descField()?.nativeElement.focus();
    }

    dateSelect() {
        this.#allFoci.reload();
    }

    onCreateNewItem() {
        let min: Dayjs | undefined;
        let max: Dayjs | undefined;
        const selectedIds = this.selection().map((_) => {
            const created = _.createdAt();
            min = min ? dayjsMin(created, min) : created;
            max = max ? dayjsMax(created, max) : created;
            return _.id;
        });
        this.selection.set([]);
        this.allFoci.update((f) => f.filter((_: Focus) => !selectedIds.includes(_.id)));
        const product = this.selectionProduct();
        if (product) {
            const desc = this.selectionDescription() + '<br>' + $localize`:@@i18n.invoices.performancePeriod:performance period` + ' ' + min!.format('DD.MM.YYYY') + ' - ' + max!.format('DD.MM.YYYY');
            this.#focusService.createInvoiceItemsFor(this.parent(), selectedIds, desc, this.selectionSum(), product.id).subscribe((newItem) => {
                this.items.update((items) => [...items, InvoiceItem.fromJson(newItem)]);
            });
        }
    }

    onPrepareInvoice() {
        const parent = this.parent();
        this.#invoiceItemService.prepareInvoice(parent as Project).subscribe(() => {
            this.#router.navigate(['/customers/' + (parent as Project).company_id + '/billing']);
        });
    }
}
