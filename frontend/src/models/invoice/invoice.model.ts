import type { NxAction } from '@models/_core/nx.actions';
import { dayjs, Dayjs } from '@constants/date/dates';
import { Dictionary } from '@constants/constants';
import { Company } from '../company/company.model';
import { Badge, Serializable } from '@models/_core/serializable';
import { InvoiceItem } from './invoice-item.model';
import { getInvoiceActions } from './invoice.actions';
import { HasInvoiceItems } from '@interfaces/hasInvoiceItems.interface';
import { nx } from '@models/_core/nx-bridge';
import { InvoiceReminder } from './invoice-reminder.model';
import { map } from 'rxjs';
import { IHasMarker } from '@enums/marker';
import { Type } from '@models/_core/hydrate';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { environment } from '@environments/environment';
import type { InvoiceSepaDto } from '@models/_core/api-response';


@Model('Invoice')
export class Invoice extends Serializable implements HasInvoiceItems, IHasMarker {
    static API_PATH = (): string => 'invoices';
    static WEBSOCKET_KEY = (): string => 'Invoice';
    static readonly FLAG_DATEV = 0x01;
    static readonly FLAG_SEPA_COLLECTED = 0x02;

    override readonly getBadge = computed(() => this.is_overdue() ? ['bg-danger', 'overdue'] as Badge : undefined);
    override readonly getAvatar = computed(() => { this.snapshot(); return this.company?.getAvatar() ?? environment.envApi + 'nexus/icon'; });
    override readonly getTooltip = computed(() => { this.snapshot(); const c = this.company?.getName(); return c ? `${c} - ${this.name}` : this.name; });

    marker: number | null = null;

    due_at: string | null = null;
    paid_at: string | null = null;
    remind_at: string | null = null;
    company_id: string = '';
    file_id: string = '';
    name: string = '';
    default_interest: number = 0;
    net: number = 0;
    gross: number = 0;
    gross_remaining: number = 0;
    vat: number = 0;
    is_cancelled: boolean = false;
    is_booked: boolean = false;
    stage: number = 0;
    sent: number = 0;
    sepa?: InvoiceSepaDto;

    is_overdue = computed(() => dayjs(this.snapshot().remind_at).isBefore(dayjs()) && !this.snapshot().paid_at);
    needs_reminder = computed(() => !this.snapshot().paid_at && dayjs(this.snapshot().remind_at).isBefore(dayjs()));
    since = computed(() => -dayjs(this.snapshot().created_at).diff(dayjs(), 'days'));
    span = computed(() => dayjs(this.snapshot().remind_at).diff(dayjs(this.snapshot().created_at), 'days'));
    progress = computed(() => { const s = this.since(), sp = this.span(); return this.snapshot().paid_at ? 1 : s / sp; });
    progress_abs = computed(() => '' + 100 * this.progress());
    css = computed(() => this.#getColorCss());

    @Type(()=>Invoice) cancelled_by!: Invoice;
    @Type(()=>Invoice) cancelles!: Invoice;
    @Type(()=>Company) company!: Company;
    @Type(()=>InvoiceItem) invoice_items!: InvoiceItem[];
    @Type(()=>InvoiceReminder) reminders!: InvoiceReminder[];

    protected override buildActions(): NxAction[] { return getInvoiceActions(this) }

    override frontendUrl = (): string => `/financial/${this.id}`;
    companyId = () => this.company_id;
    isUploadedToDatev = (): boolean => this.hasFlag(Invoice.FLAG_DATEV);
    isSepaCollected = (): boolean => this.hasFlag(Invoice.FLAG_SEPA_COLLECTED) || !!this.sepa?.collected;
    isSepaCollectable = (): boolean => !!this.sepa && !this.sepa.issues.length;
    canSepaDirectDebit = (): boolean => !this.paid_at && !this.is_cancelled && !!(this.company?.has_direct_debit || this.company?.hasSepaMandate());
    setPaid = () => this.update({ paid: true });
    setUnpaid = () => this.update({ paid: false });
    time_due = (): Dayjs => dayjs(this.due_at);
    time_remind = (): Dayjs => dayjs(this.remind_at);
    time_paid = (): Dayjs => dayjs(this.paid_at);

    getOverdueColor(): string {
        const daysOverdue = dayjs().diff(this.time_remind(), 'days');
        if (daysOverdue < nx().global.setting('INVOICE_GRACE_PERIOD')) return 'orange';
        return 'danger';
    }

    static formattedInvoiceNumber = (current?: string): string => {
        const prefix = nx().global.setting('INVOICE_NO_PREFIX') ?? '';
        const suffix = nx().global.setting('INVOICE_NO_SUFFIX') ?? '';
        const digits = parseInt(nx().global.setting('INVOICE_NO_DIGITS')) || 0;
        const number = current || `${nx().global.setting('INVOICE_NO_CURRENT') ?? ''}` || '1';
        return prefix + number.padStart(digits, '0') + suffix;
    };

    isLatestInvoice(): boolean {
        const current = parseInt(nx().global.setting('INVOICE_NO_CURRENT')) - 1;
        return this.name === Invoice.formattedInvoiceNumber(`${current}`);
    }

    #getColorCss(): string {
        if (this.snapshot().is_cancelled) return 'dark';
        if (this.snapshot().paid_at) return 'success';
        return 'teal';
    }

    d_left = (): number => (this.paid_at ? this.time_paid().diff(this.createdAt(), 'days') : this.time_remind().diff(dayjs(), 'days'));
    s_due = (): string => this.time_due().format('DD.MM.YYYY');
    state = (): string => {
        if (this.is_cancelled) return 'cancelled';
        if (this.paid_at) return 'paid';
        if (this.time_remind().diff(dayjs()) > 0) return 'unpaid';
        return 'unpaid (overdue)';
    };

    cancel = () => nx().service.post('invoices/' + this.id + '/cancel');
    undo = () => nx().service.put(`invoices/${this.id}/undo`);
    updateValues = () => nx().service.put(`invoices/${this.id}/update-values`);
    sendToDatev = () => nx().service.post(`invoices/${this.id}/datev`).pipe(map((d) => this.fromJson(d as Dictionary)));
    sendMail = () => nx().service.post(`invoices/${this.id}/send-mail`).pipe(map((d) => this.fromJson(d as Dictionary)));
    openSepaDirectDebit = async () => {
        const [{ ModalBaseService }, { ModalSepaDirectDebitComponent }] = await Promise.all([import('@app/_modals/modal-base-service'), import('@app/_modals/modal-sepa-direct-debit/modal-sepa-direct-debit.component')]);
        return ModalBaseService.open(ModalSepaDirectDebitComponent, this.id);
    };
    sendReminder = () => nx().service.post(`invoices/${this.id}/send-reminder`).pipe(map((d) => this.fromJson(d as Dictionary)));

    static aggregate = (_: Invoice[], format: string = 'YYYY'): Dictionary<number> =>
        _.reduce((x: Dictionary<number>, i: Invoice) => {
            const f = i.createdAt().format(format);
            x[f] = (x[f] || 0) + i.net;
            return x;
        }, {});
}
