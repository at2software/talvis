import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { ExpenseCategory } from '@models/expense/expense-category.model';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { Invoice } from '@models/invoice/invoice.model';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { Project } from '@models/project/project.model';
import { ProjectService } from '@models/project/project.service';
import { GlobalService } from '@models/global.service';
import { MoneyPipe } from '@pipes/money.pipe';
import { modelResource } from '@models/http/model-resource';
import { PaymentPlanDownpaymentDto, PaymentPlanStepDto, PaymentPlanStepStatus } from '@models/_core/api-response';
import { paymentPlanTriggerLabel } from '@shards/payment-plan-editor/payment-plan-editor.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface InstalmentModalOptions {
    defaultText?: string;
}

@Component({
    selector: 'modal-invoice-add-instalment',
    templateUrl: './modal-invoice-add-instalment.component.html',
    imports: [FormsModule, DecimalPipe, HotkeyDirective, MoneyPipe, NgbTooltipModule, SpinnerComponent],
    providers: [DatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalInvoiceAddInstalmentComponent extends ModalBaseComponent<InvoiceItem> {
    categories: ExpenseCategory[] = [];
    item!: InvoiceItem;
    parent!: Project | Invoice;
    displayBasePrice = 0;
    percentage = 30;
    selectedStep = signal<PaymentPlanStepDto | null>(null);

    global = inject(GlobalService);

    #projectService = inject(ProjectService);
    #datePipe = inject(DatePipe);
    #defaultText = '';
    #projectId = signal<string | undefined>(undefined);

    readonly #plan = modelResource(
        () => this.#projectId(),
        (id) => this.#projectService.showPaymentPlan(id),
    );
    readonly plan = this.#plan.value;
    readonly planLoading = this.#plan.isLoading;

    constructor() {
        super();
        effect(() => {
            const open = this.plan()?.steps.find((step) => step.status === 'open');
            if (open) this.applyStep(open);
        });
    }

    init(_: Project | Invoice, options?: InstalmentModalOptions): void {
        this.parent = _;
        this.displayBasePrice = this.#calculateStage0Sum();
        this.#defaultText = options?.defaultText || $localize`:@@i18n.common.addInstalment:instalment`;
        this.item = InvoiceItem.fromJson({
            type: InvoiceItemType.Instalment,
            vat_rate: 0,
            vat_reason: 'INSTALMENT',
            qty: -1,
            unit_name: 'Stk',
            text: this.#defaultText,
        });

        if (_ instanceof Invoice) this.item.invoice_id = _.id;
        if (_ instanceof Project) {
            this.item.project_id = _.id;
            this.#projectId.set(_.id);
        }

        this.applyPercentage();
    }

    #calculateStage0Sum(): number {
        if (this.parent instanceof Project) {
            const items = (this.parent.invoice_items ?? []).filter((item) => item.stage === 0 && !item.invoice_id);
            return items.reduce((sum, item) => sum + (item.net ?? 0), 0);
        }

        return this.parent.net ?? 0;
    }

    setPercentage = (value: number) => {
        this.percentage = value;
        this.displayBasePrice = this.#calculateStage0Sum(); // Refresh from current state
        this.applyPercentage();
    };

    applyPercentage = () => {
        const base = Number(this.displayBasePrice) || 0;
        const percent = Number(this.percentage) || 0;
        if (base <= 0 || percent <= 0) {
            this.item.price = 0;
            return;
        }
        this.item.price = Number(((base * percent) / 100).toFixed(2));
    };

    stepLabel = (step: PaymentPlanStepDto) => paymentPlanTriggerLabel(step);

    statusClass(status: PaymentPlanStepStatus): string {
        switch (status) {
            case 'invoiced':
                return 'text-bg-success';
            case 'prepared':
                return 'text-bg-warning';
            default:
                return 'text-bg-dark';
        }
    }

    statusTooltip(item: PaymentPlanDownpaymentDto | null | undefined): string {
        if (!item) return '';
        if (!item.invoice) return $localize`:@@i18n.payment.stepPrepared:prepared, not invoiced yet`;
        return `${item.invoice.name} · ${this.#datePipe.transform(item.invoice.created_at, 'shortDate')}`;
    }

    applyStep(step: PaymentPlanStepDto) {
        this.selectedStep.set(step);
        this.displayBasePrice = this.plan()?.net ?? this.displayBasePrice;
        this.percentage = step.percentage;
        this.item.price = step.amount;
        this.item.text = step.item?.text || `${this.#defaultText} – ${this.stepLabel(step)}`;
    }

    applyDownpayment(item: PaymentPlanDownpaymentDto) {
        this.selectedStep.set(null);
        this.item.price = item.net;
        this.item.text = item.text;
    }

    onSuccess = () => this.item;
}
