import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { ProjectService } from '@models/project/project.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { ProductService } from '@models/product/product.service';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { GlobalService } from '@models/global.service';
import { User } from '@models/user/user.model';
import { Color } from '@constants/Color';
import { moveInvoiceItems } from '@app/invoices/_shards/invoice-prepare/invoice-item.reorder.const';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalImportExtIssuesComponent, ExtIssueImportTracker } from '@app/_modals/modal-import-ext-issues/modal-import-ext-issues.component';
import { ModalImportPlanningComponent } from '@app/_modals/modal-import-planning/modal-import-planning.component';
import { PLANNING_SAMPLE_FILENAME, PLANNING_SAMPLE_MARKDOWN, parsePlanningMarkdown, type PlanningRow } from './planning-markdown';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { Toast } from '@shards/toast/toast';
import { concat, tap, toArray } from 'rxjs';
import { DndDirective } from '@directives/dnd.directive';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Task } from '@models/task/task.model';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { CdkTableModule } from '@angular/cdk/table';
import { AutosaveDirective } from '@directives/autosave.directive';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { ProjectInfoComponent } from '@app/projects/_shards/project-info/project-info.component';
import { ChartProgressComponent } from '@charts/chart-progress/chart-progress.component';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { PermissionsDirective } from '@directives/permissions.directive';
import { SafePipe } from '@pipes/safe.pipe';
import { MediaPreviewComponent } from '../project-media/media-preview/media-preview.component';
import type { PredictionEntryDto } from '@models/_core/api-response';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { StackedTableDirective } from '@directives/stacked-table.directive';

type DisplayFieldType = 'qty' | 'my_prediction';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-planning',
    templateUrl: './project-planning.component.html',
    styleUrls: ['./project-planning.component.scss'],
    imports: [DndDirective, StackedTableDirective, AvatarComponent, DecimalPipe, PercentPipe, CdkTableModule, AutosaveDirective, ToolbarComponent, MediaPreviewComponent, EmptyStateComponent, SpinnerComponent, ProjectInfoComponent, ChartProgressComponent, Nx, NComponent, NgbTooltipModule, CdkTableModule, CdkDropList, CdkDrag, PermissionsDirective, NgbDropdownModule, SafePipe],
})
export class ProjectPlanningComponent {
    #invoiceItemService = inject(InvoiceItemService);
    #projectService = inject(ProjectService);
    #global = inject(GlobalService);
    #input = inject(InputModalService);
    #productService = inject(ProductService);
    parent = inject(ProjectDetailGuard);
    factory = inject(PluginInstanceFactory);
    #modal = inject(ModalBaseService);

    displayField!: DisplayFieldType;
    project = this.parent.object();
    showPredictions = signal(false);

    readonly #projectId = computed(() => this.parent.object()?.id || undefined);

    readonly #items = modelListResource(this.#projectId, () => this.#invoiceItemService.indexEstimationItems(this.parent.object()));
    readonly items = linkedSignal(this.#items.value);
    readonly loading = this.#items.isLoading;

    readonly #product = modelResource(
        () => this.parent.object()?.product_id || undefined,
        (productId) => this.#productService.show(productId),
    );
    readonly product = this.#product.value;

    readonly #predictionStats = modelResource(this.#projectId, (id) => this.#projectService.predictionStats(id));
    readonly predictionTotal = computed(() => this.#predictionStats.value()?.total ?? 0);
    readonly predictions = computed<PredictionEntryDto[]>(() => {
        const entries = [...(this.#predictionStats.value()?.predictions ?? [])];
        entries.sort((_) => _.id);
        entries.forEach((_) => (_.user = User.fromJson(_['user'])));
        return entries;
    });

    isRunning = computed(() => this.displayField == 'qty');
    sumForMy = computed(() => this.items().reduce((a, b) => a + (b.my_prediction ?? 0), 0));
    sumForQty = computed(() => this.items().reduce((a, b) => a + b.qty, 0));

    loadItems = () => this.#items.reload();

    onItemResolved = () => this.items.update(arr => [...arr]);

    predictionForUser = (p: InvoiceItem, u: User): number | undefined => p.predictions.find((_) => _.user_id == u.id)?.qty ?? undefined;
    sumFor = (u: User) => this.items().reduce((a, b) => a + (b.predictions.find((_) => _.user_id == u.id)?.qty ?? 0), 0);

    updatePredictions = () => this.#predictionStats.reload();

    mean = (p: InvoiceItem) => (p.predictions.length ? p.predictions.reduce((a, b) => a + b.qty, 0) / p.predictions.length : 0);
    variance = (p: InvoiceItem) => {
        if (p.predictions.length == 0) return 0;
        const mean = this.mean(p);
        const sqr = p.predictions.map((_) => Math.pow(_.qty - mean, 2));
        return Math.sqrt(sqr.reduce((a, b) => a + b) / p.predictions.length);
    };
    variance_wt = (p: InvoiceItem) => (p.predictions.length ? this.variance(p) / this.mean(p) : 0);
    variance_color = (p: InvoiceItem) => Color.fromHsl(120 - 40 * Math.log10(this.variance(p)), 100, 60).toHexString();
    variance_wt_color = (p: InvoiceItem) => Color.fromHsl(120 - 240 * this.variance_wt(p), 100, 60).toHexString();

    readonly taskTrackers = computed(
        () =>
            (this.project.plugin_links ?? [])
                .map((link) => ({ link, instance: this.factory.instanceFor(link) as (PluginInstance & ITaskPlugin) | undefined }))
                .filter((_): _ is ExtIssueImportTracker => !!_.instance && 'ITaskPluginProperty' in _.instance),
    );

    deletePredictions = (item: InvoiceItem) => item.deletePrediction().subscribe(() => {
        this.items.update(arr => [...arr]);
        this.updatePredictions();
    });

    onNewHeader = () => {
        const title = $localize`:@@i18n.project.newHeaderTitle:New section header`;
        const infoMessage = $localize`:@@i18n.project.newHeaderInfo:Headers group the items below them. Enter a title for the new section.`;
        this.#input.open(title, true, infoMessage).confirmed(({ text, more }) => {
            this.#newItem({ text: text, type: 20 });
            if (more) this.onNewHeader();
        });
    };
    onNewItem = () => {
        const title = $localize`:@@i18n.project.newItemTitle:New item`;
        const infoMessage = $localize`:@@i18n.project.newItemDefaultProductInfo:All items created here are assigned to the default product (see project settings).`;
        this.#input.open(title, true, infoMessage).confirmed(({ text, more }) => {
            this.#newItem({ text: text, type: 0, product_source_id: this.product()!.id });
            if (more) this.onNewItem();
        });
    };
    onImportFromTracker(tracker: ExtIssueImportTracker) {
        const existingIssueIds = new Set(
            this.items()
                .filter((_) => _.ext_issue_id && String(_.ext_issue_plugin_link_id) === String(tracker.link.id))
                .map((_) => String(_.ext_issue_id)),
        );
        this.#modal.open(ModalImportExtIssuesComponent, tracker, existingIssueIds).then((tasks) => {
            if (tasks?.length) this.#importTasks(tracker, tasks);
        });
    }
    onSampleDownload = () => {
        const blob = new Blob([PLANNING_SAMPLE_MARKDOWN], { type: 'text/markdown;charset=utf-8;' });
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: PLANNING_SAMPLE_FILENAME });
        link.click();
        URL.revokeObjectURL(link.href);
    };

    onPlanningFileDropped = (files: File[]) => {
        const file = files.find((_) => /\.(md|markdown|txt)$/i.test(_.name));
        if (!file) {
            Toast.error($localize`:@@i18n.projects.planningDropUnsupported:only markdown files can be dropped here`);
            return;
        }
        if (!this.product()) {
            Toast.error($localize`:@@i18n.projects.specifyDefaultProductToAddItems:you need to specify a default product first to add new items`);
            return;
        }
        file.text().then((text) => {
            const rows = parsePlanningMarkdown(text);
            if (!rows.length) {
                Toast.error($localize`:@@i18n.projects.planningDropEmpty:no planning items found in the dropped file`);
                return;
            }
            this.#modal.open(ModalImportPlanningComponent, rows, file.name).then((selected) => {
                if (selected?.length) this.#importPlanningRows(selected);
            });
        });
    };

    onDrop = (e: import('@angular/cdk/drag-drop').CdkDragDrop<InvoiceItem[]>) => {
        const current = this.items();
        const order = moveInvoiceItems(current, e.previousIndex, e.currentIndex);
        this.items.set([...current]);
        this.#invoiceItemService.reorder(order).subscribe();
    };
    onUseAllPredictionsForUser(user: User) {
        this.items().forEach((item) => this.onPredictionAccept(item, user));
    }
    onPredictionAccept(item: InvoiceItem, user: User) {
        const pred = this.predictionForUser(item, user)!;
        this.onAcceptPrediction(item, pred);
    }
    onAcceptPrediction(item: InvoiceItem, value: number) {
        item.update({ qty: value }).subscribe(() => {
            item.qty = value!;
            this.items.update(arr => [...arr]);
        });
    }

    /**
     * Creates one invoice item per parsed row through the regular single-create endpoint.
     * The requests run sequentially so the backend sees them in file order, and the
     * resource is reloaded afterwards so the table reflects the stored positions.
     */
    #importPlanningRows = (rows: PlanningRow[]) => {
        const product = this.product();
        if (!product) return;
        const current = this.items();
        let pos = current.length ? Math.max(...current.map((_) => _.position)) + 1 : 0;
        const items = rows
            .map((row) => {
                // Headers carry no product, quantity or unit — same shape onNewHeader() creates.
                if (row.type === InvoiceItemType.Header) return this.#buildItem({ text: row.text, type: row.type, position: pos++ });
                return this.#buildItem({ text: row.text, type: row.type, qty: row.qty, position: pos++, product_source_id: product.id, ...(row.unit ? { unit_name: row.unit } : {}) });
            })
            .filter((_): _ is InvoiceItem => !!_);
        if (!items.length) return;

        const progressToast = Toast.show($localize`:@@i18n.projects.planningImporting:creating planning items…`, { classname: 'bg-info bg-gradient text-dark', icon: 'upload_file', progress: 0, autohide: false });
        let done = 0;
        concat(...items.map((item) => item.store(item.toPayload(['my_prediction']), true)))
            .pipe(
                tap(() => (progressToast.progress = Math.round((100 * ++done) / items.length))),
                toArray(),
            )
            .subscribe({
                next: () => {
                    Toast.remove(progressToast);
                    Toast.success(`${items.length} ${$localize`:@@i18n.projects.planningImported:planning items created`}`);
                    this.#items.reload();
                    this.updatePredictions();
                },
                error: (err: { error?: { message?: string }; statusText?: string }) => {
                    Toast.remove(progressToast);
                    Toast.error(err?.error?.message ?? err?.statusText ?? $localize`:@@i18n.projects.planningImportFailed:could not create the planning items`);
                    this.#items.reload();
                },
            });
    };

    #importTasks = (tracker: ExtIssueImportTracker, tasks: Task[]) => {
        const current = this.items();
        let pos = current.length ? Math.max(...current.map((_) => _.position)) + 1 : 0;
        tasks.forEach((task) => {
            this.#newItem({ text: task.name, type: 0, product_source_id: this.product()!.id, ext_issue_plugin_link_id: String(tracker.link.id), ext_issue_id: task.id, position: pos++ });
        });
    };

    #newItem = (additional: Dictionary) => {
        const item = this.#buildItem(additional);
        if (!item) return;
        item.store(item.toPayload(['my_prediction'])).subscribe(() => {
            this.items.update(arr => [...arr, item]);
        });
    };

    /** Builds an unsaved item from the default product, the global wage settings and the company's terms. */
    #buildItem = (additional: Dictionary): InvoiceItem | undefined => {
        const hUnit = this.#global.setting('INVOICE_HOUR_UNIT');
        const dUnit = this.#global.setting('INVOICE_DAY_UNIT');
        const wage: number = parseFloat(this.#global.setting('INVOICE_HOURLY_WAGE') ?? '0');
        const hpd: number = parseFloat(this.#global.setting('INVOICE_HPD') ?? '0');
        const product = this.product();
        if (!product) return undefined;

        const current = this.items();
        const pos = current.length ? Math.max(...current.map((_) => _.position)) + 1 : 0;
        const multiplier = product.price_multiplier || 1;
        let modifiers: Dictionary<any> = { project_id: this.project.id, qty: 0, position: pos };
        if (product.time_based == 1) modifiers = Object.assign(modifiers, { unit_name: hUnit, price: wage * multiplier });
        if (product.time_based == hpd) modifiers = Object.assign(modifiers, { unit_name: dUnit, price: wage * hpd * multiplier });
        modifiers = Object.assign(modifiers, additional);
        modifiers['product_id'] = null;
        modifiers['invoice_item_predictions'] = null;

        const company = this.project.company;
        if (company?.getParam('INVOICE_DISCOUNT')) {
            modifiers['discount'] = parseFloat(company.getParam('INVOICE_DISCOUNT') ?? '0');
        }
        if (product.time_based > 0) {
            if (company) modifiers['vat_rate'] = company.vatRate();
        } else if (company?.isVatExcempt()) {
            modifiers['vat_rate'] = 0;
        }

        return InvoiceItem.fromJson(modifiers);
    };
}
