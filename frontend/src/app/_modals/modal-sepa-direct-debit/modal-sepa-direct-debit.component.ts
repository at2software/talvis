import { afterRenderEffect, ChangeDetectionStrategy, Component, computed, ElementRef, inject, linkedSignal, signal, viewChildren } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { NgbActiveModal, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { dayjs, Dayjs } from '@constants/date/dates';
import { Invoice } from '@models/invoice/invoice.model';
import { InvoiceService } from '@models/invoice/invoice.service';
import { SepaIssue } from '@models/_core/api-response';
import { modelListResource } from '@models/http/model-resource';
import { httpErrorDetailsHtml } from '@models/http/file-download';
import { Nx } from '@app/nx/nx.directive';
import { MoneyPipe } from '@pipes/money.pipe';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Toast } from '@shards/toast/toast';
import { ModalBaseComponent } from '../modal-base.component';

const ISO_DATE = 'YYYY-MM-DD';

const ISSUE_LABELS: Record<SepaIssue, string> = {
    no_mandate: $localize`:@@i18n.sepa.issue.noMandate:no mandate`,
    mandate_date_missing: $localize`:@@i18n.sepa.issue.mandateDateMissing:mandate date missing`,
    iban_invalid: $localize`:@@i18n.sepa.issue.ibanInvalid:IBAN invalid`,
    nothing_due: $localize`:@@i18n.sepa.issue.nothingDue:nothing due`,
};

const nextBusinessDay = (from: Dayjs): Dayjs => {
    let day = from;
    while (day.isoWeekday() > 5) day = day.add(1, 'day');
    return day;
};

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-sepa-direct-debit',
    imports: [FormsModule, DatePipe, NgbTooltipModule, Nx, MoneyPipe, SpinnerComponent],
    templateUrl: './modal-sepa-direct-debit.component.html',
})
export class ModalSepaDirectDebitComponent extends ModalBaseComponent<boolean> {
    init(focusId?: string): void {
        this.focusId.set(focusId === undefined ? undefined : String(focusId));
    }
    onSuccess = () => true;

    activeModal = inject(NgbActiveModal);
    #invoiceService = inject(InvoiceService);

    readonly minDate = dayjs().add(1, 'day').format(ISO_DATE);
    readonly issueLabels = ISSUE_LABELS;

    private readonly rows = viewChildren<ElementRef<HTMLElement>>('row');

    focusId = signal<string | undefined>(undefined);
    candidates = modelListResource(() => this.#invoiceService.sepaDirectDebitCandidates());
    selectedIds = linkedSignal(() => {
        const focusId = this.focusId();
        const preselected = this.candidates.value().filter((_) => _.isSepaCollectable() && !_.isSepaCollected() && (focusId === undefined || this.isFocused(_)));
        return new Set(preselected.map((_) => _.id));
    });
    collectionDate = signal(nextBusinessDay(dayjs().add(2, 'day')).format(ISO_DATE));
    creating = signal(false);

    selected = computed(() => this.candidates.value().filter((_) => this.selectedIds().has(_.id)));
    selectedSum = computed(() => this.selected().reduce((sum, _) => sum + (_.sepa?.amount ?? 0), 0));
    selectable = computed(() => this.candidates.value().filter((_) => _.isSepaCollectable()));
    allSelected = computed(() => this.selectable().length > 0 && this.selectable().every((_) => this.selectedIds().has(_.id)));
    canCreate = computed(() => this.selected().length > 0 && this.collectionDate() >= this.minDate && !this.creating());

    #scrolledToFocus = false;

    constructor() {
        super();
        afterRenderEffect(() => {
            const focusId = this.focusId();
            if (this.#scrolledToFocus || focusId === undefined) return;
            const row = this.rows().find((_) => _.nativeElement.dataset['id'] === focusId);
            if (!row) return;
            this.#scrolledToFocus = true;
            row.nativeElement.scrollIntoView({ block: 'center' });
        });
    }

    isFocused = (invoice: Invoice): boolean => String(invoice.id) === this.focusId();

    toggle(invoice: Invoice) {
        if (!invoice.isSepaCollectable()) return;
        this.selectedIds.update((ids) => {
            const next = new Set(ids);
            if (!next.delete(invoice.id)) next.add(invoice.id);
            return next;
        });
    }

    toggleAll() {
        this.selectedIds.set(this.allSelected() ? new Set() : new Set(this.selectable().map((_) => _.id)));
    }

    create() {
        if (!this.canCreate()) return;
        this.creating.set(true);
        this.#invoiceService.downloadSepaDirectDebit(this.selected(), this.collectionDate()).subscribe({
            next: () => {
                this.creating.set(false);
                Toast.success($localize`:@@i18n.sepa.created:SEPA direct debit file created`);
                this.candidates.reload();
            },
            error: (err: HttpErrorResponse) => {
                this.creating.set(false);
                httpErrorDetailsHtml(err).then((html) => Toast.error(html));
            },
        });
    }
}
