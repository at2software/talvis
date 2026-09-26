import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { DecimalPipe, registerLocaleData } from '@angular/common';
import locale from '@angular/common/locales/de';
import { Project } from '@models/project/project.model';
import { ActionEmitterType } from '@app/nx/nx.directive';
import { ModalEditInvoiceItemComponent } from '@app/_modals/modal-edit-invoice-item/modal-edit-invoice-item.component';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { Product } from '@models/product/product.model';
import { Company } from '@models/company/company.model';
import { Invoice } from '@models/invoice/invoice.model';
import { HOURS_PER_PERSON_DAY, InvoiceItem } from '@models/invoice/invoice-item.model';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { moveInvoiceItems, reindexInvoiceItems } from './invoice-item.reorder.const';
import { HasInvoiceItems } from '@interfaces/hasInvoiceItems.interface';
import { Dictionary } from '@constants/constants';
import { InvoiceItemAnnotationType, InvoiceItemRowComponent } from './invoice-item/invoice-item-row.component';
import { ModalInvoiceDiscountComponent } from '@app/_modals/modal-invoice-discount/modal-invoice-discount.component';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { debounceTime, filter, forkJoin, map } from 'rxjs';
import { modelListResource } from '@models/http/model-resource';
import { LiveSyncService } from '@models/live/live-sync.service';
import { DataChangedPayload } from '@services/websocket.service';
import { GlobalService } from '@models/global.service';
import { NxStatic } from '@app/nx/nx.static';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Nx } from '@app/nx/nx.directive';
import { CdkTableModule } from '@angular/cdk/table';
import { MoneyPipe } from '@pipes/money.pipe';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { ExtIssueResolverService, ExtIssueRef } from '@models/ext-issue/ext-issue-resolver.service';
import { StackedTableDirective } from '@directives/stacked-table.directive';

const LIVE_RELOAD_DEBOUNCE_MS = 400;

type TNewItems = 'item' | 'paydown' | 'group' | 'discount';
interface VatEntry {
    title: string;
    value: number;
}

@Component({
    selector: 'invoice-prepare',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './invoice-prepare.html',
    styleUrls: ['./invoice-prepare.scss'],
    imports: [StackedTableDirective, ToolbarComponent, DecimalPipe, Nx, CdkTableModule, InvoiceItemRowComponent, MoneyPipe, NgbDropdownModule, NgbTooltipModule, CdkDrag, CdkDropList, HotkeyDirective, SpinnerComponent],
})
export class InvoicePrepare {
    #invoiceService = inject(InvoiceItemService);
    #modalGroups = inject(InputModalService);
    #modalService = inject(ModalBaseService);
    #global = inject(GlobalService);
    #extIssueResolver = inject(ExtIssueResolverService);
    #liveSync = inject(LiveSyncService);

    parent = input.required<HasInvoiceItems>();
    items = input<InvoiceItem[] | undefined>(undefined);
    stageFilter = input<number | undefined>(undefined);
    companyRef = input<Company | undefined>(undefined);
    showTools = input<boolean>(true);
    allowedNewItems = input<TNewItems[]>(['item', 'paydown', 'group', 'discount']);
    withInstalments = input<boolean>(true);
    annotationType = input<InvoiceItemAnnotationType>('invoice');

    dataLoaded = output<InvoiceItem[]>();

    _items = signal<InvoiceItem[]>([]);
    vat = signal<VatEntry[]>([]);
    net = signal<number>(0);
    gross = signal<number>(0);
    lastGroup = signal<InvoiceItem | undefined>(undefined);
    selection = signal<InvoiceItem[]>([]);
    selectionNet = signal<number>(0);
    selectionQty = signal<number>(0);

    readonly #selectionNotTimeBased = computed(() => this.selection().filter((_) => _.isRegularItem() && _.pt === 0));
    selectionHours = computed(() => this.selectionQty() * HOURS_PER_PERSON_DAY);
    selectionNotTimeBasedCount = computed(() => this.#selectionNotTimeBased().length);
    selectionNotTimeBasedNet = computed(() => this.#selectionNotTimeBased().reduce((sum, _) => sum + _.net, 0));

    readonly #itemsResource = modelListResource(
        () => (this.items() === undefined ? this.parent()?.id : undefined),
        () =>
            this.#invoiceService.getInvoiceItems(this.parent(), { append: 'my_prediction', with: 'predictions' }).pipe(
                map((items) => {
                    const stage = this.stageFilter();
                    const filtered = stage === undefined ? items : items.filter((item) => item.stage === stage && !item.invoice_id);
                    return filtered.sort((a, b) => a.position - b.position);
                }),
            ),
    );
    loading = this.#itemsResource.isLoading;

    extIssues = signal<Record<string, ExtIssueRef>>({});

    regularItems = computed(() => (this.withInstalments() ? this._items().filter((_) => _.type !== InvoiceItemType.Instalment) : this._items()));
    instalmentItems = computed(() => (this.withInstalments() ? this._items().filter((_) => _.type === InvoiceItemType.Instalment) : []));
    remaining = computed(() => this.gross() + this.instalmentItems().reduce((acc, _) => acc + _.gross, 0));
    isInvoice = computed(() => this.parent() instanceof Invoice);
    company = computed(() => (this.parent() instanceof Company ? (this.parent() as Company) : undefined));
    project = computed(() => (this.parent() instanceof Project ? (this.parent() as Project) : undefined));
    invoice = computed(() => (this.parent() instanceof Invoice ? (this.parent() as Invoice) : undefined));
    product = computed(() => (this.parent() instanceof Product ? (this.parent() as Product) : undefined));
    effectiveCompany = computed(() => this.company() ?? this.project()?.company ?? this.invoice()?.company ?? this.companyRef());

    constructor() {
        registerLocaleData(locale);

        effect(() => {
            const provided = this.items();
            const next = provided ?? (this.#itemsResource.hasValue() ? this.#itemsResource.value() : undefined);
            if (next !== undefined) untracked(() => this.#publish(next));
        });

        NxStatic.broadcast$.pipe(takeUntilDestroyed()).subscribe((broadcast) => {
            const currentItems = this._items();
            if (!currentItems.length) return;

            const updatedItem = broadcast.data as InvoiceItem;
            if (!currentItems.some((item) => item === updatedItem)) return;

            if (currentItems.some((item) => item.isNonPersistantRecord)) {
                this.#reindex(currentItems);
                this.dataLoaded.emit(currentItems);
            } else {
                this.reload();
            }
        });

        this.#liveSync.externalChanges$
            .pipe(
                filter((payload) => this.#affectsItems(payload)),
                debounceTime(LIVE_RELOAD_DEBOUNCE_MS),
                takeUntilDestroyed(),
            )
            .subscribe(() => {
                if (this.items() !== undefined) return;
                this.reload();
            });

        this.#global
            .onSelectionIn(() => this._items(), 'net', 'pt')
            .pipe(takeUntilDestroyed())
            .subscribe(([selection, selectionNet, selectionQty]) => {
                this.selection.set(selection);
                this.selectionNet.set(selectionNet);
                this.selectionQty.set(selectionQty);
            });

        effect(() => this.#extIssueResolver.resolveRows(this.project(), this._items(), this.extIssues));
    }

    #affectsItems(payload: DataChangedPayload): boolean {
        const parent = this.parent();
        if (parent?.class === payload.class && String(parent.id) === String(payload.id)) return true;
        return this._items().some((item) => item.class === payload.class && String(item.id) === String(payload.id));
    }

    clear = () => this._items.set([]);

    reload = () => this.#itemsResource.reload();

    #publish(items: InvoiceItem[]) {
        const updated = this.#reindex(items);
        this._items.set(updated);
        this.dataLoaded.emit(updated);
    }

    #reindex(items: InvoiceItem[]): InvoiceItem[] {
        const { items: reindexed, net, gross, vat } = reindexInvoiceItems(items);
        this.net.set(net);
        this.gross.set(gross);
        this.vat.set(vat);
        this.#global.forceSelectionUpdate();
        return reindexed;
    }

    hasNewSet = (_: TNewItems) => this.allowedNewItems().contains(_);

    onQuickQtyChange() {
        this._items.set(this.#reindex(this._items()));
    }

    onDrop = (e: CdkDragDrop<InvoiceItem[]>) => {
        const regularItems = [...this.regularItems()];
        const order = moveInvoiceItems(regularItems, e.previousIndex, e.currentIndex);

        const reorderedRegularQueue = [...regularItems];
        const reordered = this._items().map((item) => {
            if (item.type === InvoiceItemType.Instalment) return item;
            return reorderedRegularQueue.shift() ?? item;
        });

        this.#invoiceService.reorder(order).subscribe();
        this._items.set(this.#reindex(reordered));
    };

    singleActionResolved(e: ActionEmitterType) {
        const reloadTitles = [$localize`:@@i18n.common.delete:delete`, $localize`:@@i18n.invoices.combine:combine`, 'active', 'inactive'];
        if (reloadTitles.includes(e.action.title)) {
            this.reload();
        } else {
            this._items.set(this.#reindex(this._items()));
        }
    }

    onNewItem = (continueWith?: InvoiceItem) => {
        const item = continueWith ?? this.#getNewItem();
        const company = this.companyRef();
        if (!company) return;
        this.#modalService
            .open(ModalEditInvoiceItemComponent, item, company, 'Add', '@@i18n.invoice.addNewInvoiceItem', 'Add & next')
            .then((_) => {
                if (_ && 'item' in _) {
                    const key = InvoiceItem.parentField(this.parent());
                    if (key) {
                        (_.item as unknown as Record<string, unknown>)[key] = this.parent().id;
                        const payload = _.item.toPayload(['my_prediction']);
                        payload[key] = this.parent().id;
                        payload.position = this.#getNextPosition();
                        _.item.store(payload).subscribe((x: InvoiceItem) => {
                            this._items.set(this.#reindex([...this._items(), InvoiceItem.fromJson(x)]));
                        });
                        if (_.continue) {
                            this.onNewItem(_.item);
                        }
                    }
                }
            });
    };

    onNewPaydown = (continueWith?: InvoiceItem) => {
        const item = continueWith ?? this.#getNewItem();
        const company = this.companyRef();
        if (!company) return;
        this.#modalService
            .open(ModalEditInvoiceItemComponent, item, company, 'Add', 'New paydown')
            .then((_) => {
                if (_ && 'item' in _) {
                    const key = InvoiceItem.parentField(this.parent());
                    if (key) {
                        (_.item as unknown as Record<string, unknown>)[key] = this.parent().id;

                        const payload = _.item.toPayload(['my_prediction']);
                        payload.position = this.#getNextPosition();
                        payload.type = InvoiceItemType.Paydown;
                        payload.qty = -(payload.qty as number);

                        const payloadCompany = _.item.toPayload(['my_prediction']);
                        payloadCompany[key] = null;
                        payloadCompany.company_id = this.parent().companyId();
                        const proj = this.project();
                        if (proj) {
                            payloadCompany.text = `<b>${proj.name}</b><br>${payloadCompany.text}`;
                            if (proj.po_number) {
                                payloadCompany.text = `${proj.po_number}<br>${payloadCompany.text}`;
                            }
                        }

                        forkJoin([_.item.store(payload), _.item.store(payloadCompany)]).subscribe((a: InvoiceItem[]) => {
                            this._items.set(this.#reindex([...this._items(), InvoiceItem.fromJson(a[0])]));
                        });

                        if (_.continue) {
                            this.onNewItem(_.item);
                        }
                    }
                }
            });
    };

    onNewGroup = () =>
        this.#modalGroups
            .open('@@i18n.common.title')
            .then((result) => {
                if (result) {
                    const { text } = result;
                    const group = this.#getNewItem(InvoiceItemType.Header);
                    group.text = text;
                    const payload = group.toPayload(['my_prediction']);
                    payload.position = this.#getNextPosition();
                    group.store(payload).subscribe((x) => {
                        this._items.set(this.#reindex([...this._items(), InvoiceItem.fromJson(x)]));
                    });
                }
            });

    onNewDiscount = () =>
        this.#modalService.open(ModalInvoiceDiscountComponent, 'add discount', this.#getBasePrice()).then((res) => {
            if (res) {
                const _ = this.#getNewItem(InvoiceItemType.Discount);
                _.text = res.title;
                _.price = res.price;
                _.qty = res.qty;
                _.unit_name = res.unit;
                const payload = _.toPayload(['my_prediction']);
                payload.position = this.#getNextPosition();
                _.store(payload).subscribe((x) => {
                    this._items.set(this.#reindex([...this._items(), InvoiceItem.fromJson(x)]));
                });
            }
        });

    #getFilteredCompanyNet = () =>
        this.company()
            ?.invoice_items.filter((a) => a.type === InvoiceItemType.Default)
            .reduce((a, b) => a + b.net, 0) ?? undefined;
    #getBasePrice = () => this.project()?.net ?? this.#getFilteredCompanyNet() ?? 0;

    #getNewItem = (t: InvoiceItemType = InvoiceItemType.Default) => {
        const key = InvoiceItem.parentField(this.parent());
        const data: Dictionary = { type: t, position: 0 };
        if (key && this.parent()?.id) {
            data[key] = this.parent().id;
        }
        const company = this.effectiveCompany();
        if (company?.getParam('INVOICE_DISCOUNT')) {
            data['discount'] = parseFloat(company.getParam('INVOICE_DISCOUNT') ?? '0');
        }
        if (company?.isVatExcempt()) {
            data['vat_rate'] = 0;
        }
        return InvoiceItem.fromJson(data);
    };

    #getNextPosition = (): number => {
        const next = Math.max(...this._items().map((ii) => ii.position)) + 1;
        return !next || next === Infinity || next === -Infinity ? 0 : next;
    };
}
