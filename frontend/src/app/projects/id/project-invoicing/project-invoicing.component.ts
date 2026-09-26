import { ChangeDetectionStrategy, Component, inject, signal, viewChild, effect, computed } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { NComponent } from '@shards/n/n.component';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { Assignee } from '@models/assignee/assignee.model';
import { AssignmentService } from '@models/assignee/assignment.service';
import { CompanyContact } from '@models/company/company-contact.model';
import { BillingConsiderationDto } from '@models/_core/api-response';
import { GlobalService } from '@models/global.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { ProjectService } from '@models/project/project.service';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { PdfCreationType } from '@enums/PdfCreationType';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { InvoiceVatHandling } from '@enums/invoice.vat-handling';
import { Invoice } from '@models/invoice/invoice.model';
import { InvoicePrepareWrapper } from '@app/invoices/_shards/invoice-prepare-wrapper/invoice-prepare-wrapper';
import { ToastService } from '@shards/toast/toast.service';
import { ProbabilityCurvePoint } from './project-invoicing-gauge.component';
import { dayjs } from '@constants/date/dates';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalEditInvoiceItemComponent } from '@app/_modals/modal-edit-invoice-item/modal-edit-invoice-item.component';
import { ModalInvoiceDiscountComponent } from '@app/_modals/modal-invoice-discount/modal-invoice-discount.component';
import { ModalInvoiceAddInstalmentComponent } from '@app/_modals/modal-invoice-add-instalment/modal-invoice-add-instalment.component';
import { SafePipe } from '@pipes/safe.pipe';
import { MoneyPipe } from '@pipes/money.pipe';
import { catchError, forkJoin, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { QuoteAcceptanceSuggestionDto } from '@models/_core/api-response';
import { MlReliabilityDirective } from '@directives/ml-reliability.directive';
import { TInvoicing } from '@models/project/invoicing-type';
import { AvatarComponent } from '@shards/avatar/avatar.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-detail-quote',
    imports: [AvatarComponent, FormsModule, DatePipe, DecimalPipe, PercentPipe, ToolbarComponent, InvoicePrepareWrapper, NComponent, NgbTooltipModule, NgbDropdownModule, SafePipe, MoneyPipe, MlReliabilityDirective],
    templateUrl: './project-invoicing.component.html',
    styleUrl: './project-invoicing.component.scss',
})
export class ProjectInvoicingComponent {

    #projectService = inject(ProjectService);
    #assignmentService = inject(AssignmentService);
    #global = inject(GlobalService);
    #router = inject(Router);
    #toastService = inject(ToastService);
    #parent = inject(ProjectDetailGuard);
    #inputModalService = inject(InputModalService);
    #route = inject(ActivatedRoute);

    personalized?: CompanyContact;
    invoiceNumber = Invoice.formattedInvoiceNumber();
    invoicingType = signal<number>(TInvoicing.Quote);
    invoicedUntil?: string = undefined;
    isCreatingInvoice = signal(false);
    currentBillingConsiderations = signal<BillingConsiderationDto[]>([]);
    budgetCurve: ProbabilityCurvePoint[] = [];
    timeMult: number = 1;
    project = this.#parent.object();

    get global() { return this.#global; }

    backendConsiderations = computed(() => this.#parent.object().company?.billing_considerations || []);
    hasBillingConcerns = computed((): boolean => this.currentBillingConsiderations().length > 0);
    billingConcernsTooltip = computed((): string => {
        if (!this.hasBillingConcerns()) return '';
        const errors = this.currentBillingConsiderations().filter((c) => c.type === 'error').length;
        const warnings = this.currentBillingConsiderations().filter((c) => c.type === 'warning').length;
        const parts = [];
        if (errors > 0) parts.push($localize`:@@i18n.invoice.billingErrors:${errors} error(s)`);
        if (warnings > 0) parts.push($localize`:@@i18n.invoice.billingWarnings:${warnings} warning(s)`);
        return parts.join(', ');
    });
    hasDownpaymentItems = computed((): boolean => this.#parent.object().invoice_items.some((x: InvoiceItem) => x.stage === 2 && !x.invoice_id) ?? false);
    hasSupportItems = computed((): boolean => this.#parent.object().invoice_items.some((x: InvoiceItem) => x.stage === 1 && !x.invoice_id) ?? false);
    finalItems = computed((): InvoiceItem[] => this.#parent.object().invoice_items.filter((x: InvoiceItem) => x.stage === 0 && !x.invoice_id) ?? []);
    invoicedDownpayments = computed((): number => this.#parent.object().invoiced_downpayments ?? 0);
    pendingDownpayments = computed((): number => this.#parent.object().invoice_items?.filter((x: InvoiceItem) => x.stage === 2 && !x.invoice_id)?.reduce((sum: number, x: InvoiceItem) => sum + (x.net || 0), 0) ?? 0);
    downpaymentRemaining = computed((): number => (this.#parent.object().net ?? 0) - this.invoicedDownpayments() - this.pendingDownpayments());
    invoicedTotal = computed((): number => Math.max(0, (this.#parent.object().net ?? 0) - (this.#parent.object().net_remaining ?? 0)));
    invoicingProgress = computed((): number => {
        const net = this.#parent.object().net ?? 0;
        return net > 0 ? Math.min(1, this.invoicedTotal() / net) : 0;
    });
    quoteAcceptanceReliable = computed((): boolean => {
        const raw = this.#global.setting('ML_RELIABILITY_PROJECT_QUOTE_ACCEPTANCE');
        if (!raw) return false;
        try {
            return JSON.parse(raw as string).bucket !== 'low';
        } catch {
            return false;
        }
    });

    private readonly invoicingContent = viewChild(InvoicePrepareWrapper);

    #timeCurve: ProbabilityCurvePoint[] = [];

    readonly #quoteDescriptions = modelListResource(
        () => this.#parent.object()?.id || undefined,
        (projectId) => this.#projectService.indexQuoteDescriptions(projectId),
    );
    readonly quoteDescriptions = this.#quoteDescriptions.value;

    readonly #quoteAcceptancePrediction = modelResource(
        () => (this.invoicingType() === TInvoicing.Quote ? this.#parent.object()?.id || undefined : undefined),
        (projectId) => this.#projectService.showQuoteAcceptancePrediction(projectId).pipe(catchError(() => of(null))),
    );
    readonly quoteAcceptancePrediction = this.#quoteAcceptancePrediction.value;

    constructor() {
        this.#route.url.pipe(takeUntilDestroyed()).subscribe((segments) => this.invoicingType.set(this.#typeFromRoute(segments[0]?.path)));

        effect(() => {
            const object = this.#parent.object();
            this.#updateTimeMult();

            this.personalized = object.assignees
                .filter((a) => a.company_contact_id)
                .map((a) => Assignee.fromJson(a))
                .first()?.assignee as CompanyContact;

            this.invoicedUntil = '';
        });
    }

    #updateTimeMult() {
        const project = this.#parent.object();
        if (!this.#timeCurve.length || !project.started_at) return;
        const maxY = Math.max(...this.#timeCurve.map((p) => p.y));
        if (maxY === 0) return;
        const days = dayjs().diff(dayjs(project.started_at), 'days');
        const timeY = this.#findYBelowThreshold(this.#timeCurve, days) ?? this.#timeCurve[0].y;
        this.timeMult = timeY / maxY;
    }

    #findYBelowThreshold(curve: ProbabilityCurvePoint[], threshold: number): number | null {
        let lo = 0,
            hi = curve.length - 1,
            result: number | null = null;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (curve[mid].x < threshold) {
                result = curve[mid].y;
                lo = mid + 1;
            } else hi = mid - 1;
        }
        return result;
    }

    #typeFromRoute(mode?: string): TInvoicing {
        switch (mode) {
            case 'downpayment':
                return TInvoicing.PartialInvoice;
            case 'support':
                return TInvoicing.SupportInvoice;
            case 'final':
                return TInvoicing.FinalInvoice;
            case 'quote':
            default:
                return TInvoicing.Quote;
        }
    }

    #routeFromType(type: TInvoicing): string {
        switch (type) {
            case TInvoicing.PartialInvoice:
                return 'downpayment';
            case TInvoicing.SupportInvoice:
                return 'support';
            case TInvoicing.FinalInvoice:
                return 'final';
            case TInvoicing.Quote:
            default:
                return 'quote';
        }
    }

    onConsiderationsChanged = (considerations: BillingConsiderationDto[]) => {
        setTimeout(() => this.currentBillingConsiderations.set(considerations));
    };

    navigateToSupport(event: Event) {
        event.stopPropagation();
        this.#router.navigate(['/projects', this.#parent.object().id, 'support']);
    }

    prepareInvoice() {
        const moveToCustomer = this.invoicingType() === TInvoicing.SupportInvoice
            ? this.#projectService.moveSupportToCustomer(this.#parent.object())
            : this.#projectService.moveRegularItemsToCustomer(this.#parent.object());

        moveToCustomer.subscribe((_) => {
            this.#router.navigate(['/customers/' + this.#parent.object().company_id + '/billing']);
        });
    }
    convertSupportToRegular() {
        this.#projectService.convertSupportItemsToRegular(this.#parent.object()).subscribe(() => {
            this.#parent.reload();
            this.onInvoicingTypeChange(TInvoicing.FinalInvoice);
        });
    }
    makeDraftInvoice = () => this.makeInvoice(true);
    makeInvoice = (draft = false) => {
        const project = this.#parent.object();
        this.isCreatingInvoice.set(true);
        this.invoicingContent()?.table()?.clear();
        const callback = () => {
            this.isCreatingInvoice.set(false);
            if (draft) return;
            this.#global.reloadInvoiceNumber().subscribe(() => {
                this.#gotoCompanyInvoices();
            });
        };
        const type = this.invoicingType();
        switch (type) {
            case 0:
                this.#projectService.makePdf(project, PdfCreationType.Create, () => this.#parent.reload());
                setTimeout(() => this.isCreatingInvoice.set(false), 500);
                break;
            case 1:
            case 2:
            case 3:
                return this.#projectService.makeInvoice(project, type, callback, draft);
        }
    };
    #gotoCompanyInvoices = () => this.#router.navigate(['customers/' + this.#parent.object().company.id + '/invoices']);

    onAddCompanyContact(x: CompanyContact) {
        const object = this.#parent.object();
        const assignment = object.assignees.find((a: Assignee) => a.company_contact_id === x.id);
        if (assignment) {
            this.#assignmentService.setMainContact(object, assignment.id).subscribe(() => this.#parent.reload());
        } else {
            this.#assignmentService.addToProject(object, { id: x.id, class: 'company_contact' }).subscribe((newAssignment: Assignee) => {
                if (newAssignment?.id) {
                    this.#assignmentService.setMainContact(object, newAssignment.id).subscribe(() => this.#parent.reload());
                } else {
                    this.#parent.reload();
                }
            });
        }
    }

    getAssignedContacts = (): CompanyContact[] => {
        const project = this.#parent.object();
        if (!project.company?.employees) return [];
        return project.company.employees.filter((e) => !e.is_retired);
    };

    suggestionText(s: QuoteAcceptanceSuggestionDto): string {
        const to = Math.round(s.to);
        const from = Math.round(s.from);
        const points = (s.to - s.from).toFixed(0);
        switch (s.feature) {
            case 'item_count':
                return s.to > s.from
                    ? $localize`:@@i18n.projects.quoteSuggestion.moreItems:split into ${to} items (currently ${from})`
                    : $localize`:@@i18n.projects.quoteSuggestion.fewerItems:combine into ${to} items (currently ${from})`;
            case 'net':
                return s.to > s.from
                    ? $localize`:@@i18n.projects.quoteSuggestion.higherNet:increase the quote value`
                    : $localize`:@@i18n.projects.quoteSuggestion.lowerNet:lower the quote value`;
            case 'discount_pct':
                return $localize`:@@i18n.projects.quoteSuggestion.discount:offer ${points} more discount`;
            case 'prefix_length':
                return s.from <= 0
                    ? $localize`:@@i18n.projects.quoteSuggestion.addIntro:write a personalized introduction`
                    : $localize`:@@i18n.projects.quoteSuggestion.longerIntro:write a longer introduction`;
        }
    }

    warningMissingContact = () => !this.#parent.object()?.personalized?.firstName;
    adresseeName = () => {
        const p = this.#parent.object()?.personalized;
        return p?.firstName ? `${p.salutation || ''} ${p.firstName} ${p.familyName || ''}`.trim()
                            : $localize`:@@i18n.project.selectCompanyContact:select company contact`;
    };

    onChangePO() {
        const project = this.#parent.object();
        this.#inputModalService.open($localize`:@@i18n.project.purchaseOrderNumber:PO#`, false, undefined, project.po_number).then((result) => {
            if (result?.text !== undefined) {
                project.update({ po_number: result.text }).subscribe(() => this.#parent.reload());
            }
        });
    }

    onChangePaymentDuration = () => {
        const project = this.#parent.object();
        const currentValue = project.getParam('INVOICE_PAYMENT_DURATION') || project.company.getParam('INVOICE_PAYMENT_DURATION') || '14';
        this.#inputModalService.open($localize`:@@i18n.projects.setPaymentDuration:Set payment duration in days`, false, undefined, currentValue).then((result) => {
            if (result?.text) {
                project.updateParam('INVOICE_PAYMENT_DURATION', { value: result.text }).subscribe(() => {
                    this.#toastService.show($localize`:@@i18n.projects.paymentDurationUpdated:Payment duration updated`, { classname: 'bg-success text-light' });
                    this.#parent.reload();
                });
            }
        });
    };

    removePaymentDuration = () => {
        const project = this.#parent.object();
        project.removeParam('INVOICE_PAYMENT_DURATION').subscribe(() => {
            this.#toastService.show($localize`:@@i18n.projects.paymentDurationRemoved:Payment duration removed`, { classname: 'bg-success text-light' });
            this.#parent.reload();
        });
    };

    onInvoicingTypeChange(newType: number) {
        const type = newType as TInvoicing;
        this.invoicingType.set(type);
        const project = this.#parent.object();
        this.#router.navigate(['/projects', project.id, 'invoicing', this.#routeFromType(type)]);
    }

    #storeProjectItem(item: InvoiceItem, stage: number, switchToQuote = false) {
        const project = this.#parent.object();
        item.stage = stage;
        item.project_id = project.id;
        const payload = item.toPayload(['my_prediction']);
        payload.stage = stage;
        payload.project_id = project.id;
        payload.invoice_id = null;
        payload.position = this.#getNextPositionForStage(stage);

        item.store(payload).subscribe(() => {
            if (switchToQuote) {
                this.onInvoicingTypeChange(TInvoicing.Quote);
            }
            this.#reloadProjectAndItems();
        });
    }

    #reloadProjectAndItems() {
        this.#parent.reload();
        this.invoicingContent()?.table()?.reload();
    }

    #getNextPositionForStage(stage: number): number {
        const project = this.#parent.object();
        const items = project.invoice_items?.filter((x: InvoiceItem) => x.stage === stage && !x.invoice_id) ?? [];
        if (!items.length) return 0;
        return Math.max(...items.map((x: InvoiceItem) => x.position ?? 0)) + 1;
    }

    #getCustomerVatCalculation(): InvoiceVatHandling {
        const project = this.#parent.object();
        const projectItem = project.invoice_items?.find((x: InvoiceItem) => x.vat_calculation !== undefined);
        if (projectItem?.vat_calculation !== undefined) return projectItem.vat_calculation as InvoiceVatHandling;

        const companyItem = project.company?.invoice_items?.find((x: InvoiceItem) => x.vat_calculation !== undefined);
        if (companyItem?.vat_calculation !== undefined) return companyItem.vat_calculation as InvoiceVatHandling;

        return InvoiceVatHandling.Net;
    }

    #openNewItemModal(stage: number, type: InvoiceItemType = InvoiceItemType.Default) {
        const newItem = InvoiceItem.fromJson({ type });
        const project = this.#parent.object();
        ModalBaseService.open(ModalEditInvoiceItemComponent, newItem, project.company, $localize`:@@i18n.common.add:add`)
            .then((result) => {
                if (result?.item) {
                    const item = InvoiceItem.fromJson(result.item);
                    item.type = type;
                    this.#storeProjectItem(item, stage);
                }
            });
    }

    onCreateSupportRegularItem() {
        this.#openNewItemModal(1, InvoiceItemType.Default);
    }

    onCreateDownpaymentHeaderItem() {
        this.#openNewHeaderItem(2, true);
    }
    onCreateSupportHeaderItem() {
        this.#openNewHeaderItem(1);
    }

    onCreateDownpaymentDiscountItem() {
        this.#openNewDiscountItem(2, true);
    }
    onCreateSupportDiscountItem() {
        this.#openNewDiscountItem(1);
    }

    onCreateDownpaymentInstalmentItem() {
        const project = this.#parent.object();
        ModalBaseService.open(ModalInvoiceAddInstalmentComponent, project, { defaultText: $localize`:@@i18n.common.downpayment:downpayment`, })
            .then((item) => {
                if (!item) return;

                const amount = Math.abs(Number(item.price) || 0);
                const text = item.text?.trim() || $localize`:@@i18n.common.downpayment:downpayment`;
                const vatCalculation = this.#getCustomerVatCalculation();
                const vatRate = project.company.vatRate();

                const stage2Item = InvoiceItem.fromJson({
                    text,
                    type: InvoiceItemType.Default,
                    stage: 2,
                    price: amount,
                    qty: 1,
                    unit_name: 'Stk',
                    vat_rate: vatRate,
                    vat_calculation: vatCalculation,
                    project_id: project.id,
                });

                const stage0Item = InvoiceItem.fromJson({
                    text,
                    type: InvoiceItemType.Paydown,
                    stage: 0,
                    price: amount,
                    qty: -1,
                    unit_name: 'Stk',
                    vat_rate: vatRate,
                    vat_calculation: vatCalculation,
                    project_id: project.id,
                });

                const payload2 = stage2Item.toPayload(['my_prediction']);
                payload2.project_id = project.id;
                payload2.invoice_id = null;
                payload2.stage = 2;
                payload2.position = this.#getNextPositionForStage(2);

                const payload0 = stage0Item.toPayload(['my_prediction']);
                payload0.project_id = project.id;
                payload0.invoice_id = null;
                payload0.stage = 0;
                payload0.position = this.#getNextPositionForStage(0);

                forkJoin([stage2Item.store(payload2), stage0Item.store(payload0)]).subscribe(() => this.#reloadProjectAndItems());
            });
    }

    #openNewHeaderItem(stage: number, switchToQuote = false) {
        this.#inputModalService
            .open('@@i18n.common.title')
            .then((result) => {
                if (!result?.text) return;
                const item = InvoiceItem.fromJson({
                    type: InvoiceItemType.Header,
                    text: result.text,
                    qty: 1,
                    price: 0,
                });
                this.#storeProjectItem(item, stage, switchToQuote);
            });
    }

    #openNewDiscountItem(stage: number, switchToQuote = false) {
        const project = this.#parent.object();
        const basePrice = project?.net ?? 0;
        ModalBaseService.open(ModalInvoiceDiscountComponent, $localize`:@@i18n.common.addDiscount:add discount`, basePrice)
            .then((result) => {
                if (!result) return;
                const item = InvoiceItem.fromJson({
                    type: InvoiceItemType.Discount,
                    text: result.title,
                    price: result.price,
                    qty: result.qty,
                    unit_name: result.unit,
                });
                this.#storeProjectItem(item, stage, switchToQuote);
            });
    }
}
