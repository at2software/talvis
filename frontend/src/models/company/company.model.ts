import type { NxAction } from '@models/_core/nx.actions';
import { Dictionary } from '@constants/constants';
import { CompanyService } from '@models/company/company.service';
import { CompanyContact } from './company-contact.model';
import { Project } from '../project/project.model';
import { Serializable } from '@models/_core/serializable';
import { VcardClass } from '../vcard/vcard-class.model';
import { Invoice } from '../invoice/invoice.model';
import { nx } from '@models/_core/nx-bridge';
import { InvoiceItem } from '../invoice/invoice-item.model';
import { HasInvoiceItems } from '@interfaces/hasInvoiceItems.interface';
import { File } from '../file/file.model';
import { IHasFiles } from '../file/has-files.interface';
import { Assignee } from '../assignee/assignee.model';
import { Focus } from '../focus/focus.model';
import { environment } from '@environments/environment';
import { IHasFoci } from '@models/focus/has-foci.interface';
import { User } from '@models/user/user.model';
import { LeadSource } from '@models/project/lead-source.model';
import { Transform, Type } from '@models/_core/hydrate';
import { dayjs, Dayjs } from '@constants/date/dates';
import { IHasAssignees } from '@interfaces/hasAssignees.interface';
import { ConnectionProjects } from './connection-projects.model';
import { getCompanyActions } from './company.actions';
import { IHasMarker } from '@enums/marker';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { recurrenceOf, RecurrenceOption } from '@enums/recurrence.type';
import type { BillingConsiderationDto, ProjectTimelineEntryDto } from '@models/_core/api-response';

@Model('Company')
export class Company extends VcardClass implements HasInvoiceItems, IHasFiles, IHasFoci, IHasAssignees, IHasMarker {
    static override API_PATH = (): string => 'companies';

    static readonly FLAG_DRAFT = 0x01;
    static readonly ML_CHURN_HIGH = 0.5;
    static readonly ML_CHURN_ELEVATED = 0.2;

    override readonly getAvatar = computed(() => { this.snapshot(); return environment.envApi + `companies/${this.id}/icon`; });

    isDraft = (): boolean => this.hasFlag(Company.FLAG_DRAFT);

    default_product_id: string = '';
    customer_number: string = '';
    value: number = 0;
    project_count: number = 0;
    running_project_count: number = 0;
    unpaid_invoice_count: number = 0;
    invoice_count: number = 0;
    revenue: number = 0;
    address: string = '';
    vat_id: string = '';
    managing_director: string = '';
    commercial_register: string = '';
    invoice_items: InvoiceItem[] = [];
    net: number = 0;
    net_remaining: number = 0;
    invoice_correction: string = '';
    invoice_email: string = '';
    has_direct_debit: boolean = false;
    is_deprecated: boolean = false;
    lat: number | null = null;
    lon: number | null = null;
    requires_po: boolean = false;
    has_nda: boolean = false;
    accepts_support: boolean = false;
    needs_vat_handling?: boolean = true;
    foci_unbilled_sum_duration?: number;
    cashflow_value?: number;
    invoices_last12m_sum_net?: number;
    total_time?: number;
    revenue_12?: number;
    revenue_last_1_year: number = 0;
    revenue_total: number = 0;
    earliest_invoice?: { created_at: string };
    remarketing_interval?: number;
    remarketing_due_at?: string;
    desicion_duration?: number;
    billing_considerations?: BillingConsiderationDto[];
    quote_acceptance_rate?: number | null;
    avg_payment_days?: number | null;
    avg_payment_delay_days?: number | null;
    last_invoice_at?: string | null;
    debrief_problem_count?: number;
    debrief_positive_count?: number;
    timeline_chart?: ProjectTimelineEntryDto[] = [];
    ml_churn_probability_12m?: number;
    ml_predicted_next_purchase_date?: string;
    ml_overdue_for_contact?: boolean;
    ml_predicted_support_hours?: number;
    marker: number | null = null;
    @Transform(({ value }) => Company.toSource(value as Dictionary | undefined)) source?: CompanyContact | User | LeadSource;

    hasTimeBudget!: () => boolean;
    frontendUrl = (): string => `/customers/${this.id}`;
    companyId = (): string => this.id;
    lastUpdateDuration = () => dayjs().diff(dayjs(this.updated_at), 'days');
    isVatExcempt = computed(() => (this.snapshot().vat_id?.length ?? 0) > 0);
    vatRate = computed(() => this.isVatExcempt() || !this.isEuropeanCountry() ? 0 : nx().global.user!.getFloatParam('VAT_RATE', 19)!);
    remarketingOption = computed((): RecurrenceOption => recurrenceOf(this.snapshotAsThis().remarketing_interval));
    remarketingDays = computed((): number => this.remarketingOption().days);
    assignedUsers = computed((): Assignee[] => { this.snapshot(); return this.assignees.filter((_) => _.assignee instanceof User) });

    acceptedChildren = computed((): (typeof Serializable)[] => [Project, InvoiceItem, Invoice, Focus]);
    getLocale = computed((): string => {
        this.snapshot();
        const card = this.card();
        const lang = card?.first('X-LANG')?.vals[0] || 'de';
        const formality = card?.first('X-FORMALITY')?.vals[0] || 'formal';
        return `${lang}-${formality}`;
    });
    averagePaymentDelay = computed((): number => this.snapshot().avg_payment_delay_days ?? 0);
    remarketingProgress = computed(() => {
        const days = this.remarketingDays();
        return days === 0 ? 0 : this.lastUpdateDuration() / days;
    });

    revenue12m = computed((): number => { this.snapshot(); return +(this.getParam('INVOICE_REVENUE_12M') ?? 0) });
    forecast12m = computed((): number => { this.snapshot(); return +(this.getParam('STATS_LINREG_FORECAST_12M') ?? 0) });
    forecastUp = computed((): boolean => this.forecast12m() >= this.revenue12m());
    forecastChange = computed((): number => { const current = this.revenue12m(); return current > 0 ? (this.forecast12m() - current) / current : 0 });

    mlPredictedRevenue12m = computed((): number | undefined => { this.snapshot(); return this.getFloatParam('ML_PREDICTED_REVENUE_12M') });
    mlPredictedIntervalDays = computed((): number | undefined => { this.snapshot(); return this.getFloatParam('ML_PREDICTED_INTERVAL_DAYS') });
    mlChurnProbability12m = computed((): number | undefined => { this.snapshot(); return this.getFloatParam('ML_CHURN_PROBABILITY_12M') ?? this.ml_churn_probability_12m });
    mlPredictedSupportHours = computed((): number | undefined => { this.snapshot(); return this.getFloatParam('ML_PREDICTED_SUPPORT_HOURS') ?? this.ml_predicted_support_hours });

    mlPredictedNextPurchaseAt = computed((): Dayjs | undefined => {
        const interval = this.mlPredictedIntervalDays();
        const last = this.snapshot().last_invoice_at;
        if (interval !== undefined && last) {
            return dayjs(last).add(Math.round(interval), 'day');
        }
        return this.ml_predicted_next_purchase_date ? dayjs(this.ml_predicted_next_purchase_date) : undefined;
    });

    mlOverdueForContact = computed((): boolean => {
        const next = this.mlPredictedNextPurchaseAt();
        return next !== undefined ? next.isBefore(dayjs()) : (this.ml_overdue_for_contact ?? false);
    });

    mlChurnHigh = computed((): boolean => (this.mlChurnProbability12m() ?? 0) >= Company.ML_CHURN_HIGH);
    mlChurnColor = computed((): string => { const p = this.mlChurnProbability12m() ?? 0; return p >= Company.ML_CHURN_HIGH ? 'text-danger' : p >= Company.ML_CHURN_ELEVATED ? 'text-warning' : 'text-white'; });
    mlNeedsAttention = computed((): boolean => this.mlOverdueForContact() || this.mlChurnHigh());

    protected override buildActions(): NxAction[] { return getCompanyActions(this) }

    @Type(()=>Assignee) pivot!: Assignee;
    @Type(()=>Project) projects_unfinished!: Project[];
    @Type(()=>Project) base_projects!: Project[];
    @Type(()=>CompanyContact) employees!: CompanyContact[];
    @Type(()=>Invoice) invoices!: Invoice[];
    @Type(()=>File) files!: File[];
    @Type(()=>Assignee) assignees!: Assignee[];
    @Type(()=>InvoiceItem) upcoming_repeating_invoice_items!: InvoiceItem[];
    @Type(()=>Focus) foci!: Focus[];
    @Type(()=>ConnectionProjects) available_connections?: ConnectionProjects[];

    setParent = (_: Serializable) => console.error('setParent() not allowed for companies');

    static toSource(_?: Dictionary): CompanyContact | User | LeadSource | undefined {
        if (!_) return undefined;
        if (_.class === 'CompanyContact') return CompanyContact.fromJson(_);
        if (_.class === 'User') return User.fromJson(_);
        if (_.class === 'LeadSource') return LeadSource.fromJson(_);
        return undefined;
    }

    setSource(_?: Dictionary) {
        const source = Company.toSource(_);
        if (source) this.source = source;
    }

    importImprint = () => nx().getService<CompanyService>(CompanyService).importImprint(this);

    static iconForId = (id: string) => environment.envApi + `companies/${id}/icon`;
}
