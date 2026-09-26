import type { NxAction } from '@models/_core/nx.actions';
import { getInvoiceItemTypeRepeatColor, InvoiceItemType, InvoiceItemTypeRepeating } from '@enums/invoice-item.type';
import { Dictionary } from '@constants/constants';
import { InvoiceVatHandling } from '@enums/invoice.vat-handling';
import { Product } from '../product/product.model';
import { Serializable } from '@models/_core/serializable';
import { getInvoiceItemActions } from './invoice-item.actions';
import { nx, TBroadcast } from '@models/_core/nx-bridge';
import { Toast } from '@shards/toast/toast';
import { deepMerge } from '@constants/object/deepMerge';
import { deepCopy } from '@constants/object/deepClone';
import { Prediction } from '../prediction.model';
import { Project } from '../project/project.model';
import { Company } from '../company/company.model';
import { Invoice } from './invoice.model';
import { REPEATING_MULT } from '../expense/expense.model';
import { map } from 'rxjs';
import { Type } from '@models/_core/hydrate';
import { MODAL } from '@models/_core/modal-registry';
import { Milestone } from '../milestone/milestone.model';
import { IHasMarker } from '@enums/marker';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { IHasExtIssue, effectiveExtIssueOf } from '../ext-issue/ext-issue.interface';

export const HOURS_PER_PERSON_DAY = 8;

@Model('InvoiceItem')
export class InvoiceItem extends Serializable implements IHasMarker, IHasExtIssue {
    static API_PATH = (): string => 'invoice_items';

    override readonly getName = computed(() => { this.snapshot(); return this.text; });

    product_id?: string;
    project_id?: string;
    company_id?: string;
    invoice_id?: string;
    product_source_id?: string;
    ext_issue_plugin_link_id?: string;
    ext_issue_id?: string;
    position: number = 0;
    text: string = '';
    vat_rate: number = 19;
    vat_reason: string = '';
    price: number = 0;
    qty: number = 1;
    is_discountable: boolean = false;
    unit_name: string = 'pcs';
    unit_factor: number = 0;
    recurrence: string = '';
    next_recurrence_at?: string;
    active: string = '';
    total: number = 0;
    net: number = 0;
    gross: number = 0;
    vat: number = 0;
    discount: number = 0;
    wage: number = 0;
    type: InvoiceItemType = InvoiceItemType.Default;
    stage: number = 0;
    vat_calculation: InvoiceVatHandling = InvoiceVatHandling.Net;
    my_prediction: number | null = null;
    predictions: Prediction[] = [];
    price_discounted?: number;
    vat_rate_dec?: number;
    fociSum?: number;
    foci_count?: number;
    billed_foci_count?: number;
    billed_foci_sum_duration?: number;
    progress?: number;
    marker: number | null = null;
    foci_by_user?: { user_id: string; duration: number }[];
    foci_sum_duration?: number;
    delete_blockers: string[] = [];

    canModifyQuantity = computed(() => this.snapshot().type === 0);
    qtyMultiplicator = computed(() => this.snapshot().unit_name === '%' ? 0.01 : 1);
    isNonPersistantRecord: boolean = false;

    @Type(()=>Product) product_source!: Product;
    @Type(()=>Company) company!: Company;
    @Type(()=>Project) project?: Project;
    @Type(()=>Milestone) milestones!: Milestone[];

    get _mult() {
        return this.unit_name == '%' ? 0.01 : 1;
    }
    get _total() {
        return this.qty * this.price * (1 - 0.01 * this.discount) * this._mult;
    }
    get _net() {
        return this.vat_calculation == InvoiceVatHandling.Net ? this.total : (this.total / 0.01) * (100 + this.vat);
    }
    get _gross() {
        return this.vat_calculation == InvoiceVatHandling.Net ? this.total * 0.01 * (100 + this.vat) : this.total;
    }
    get pt() {
        return this.#calculatePersonDays(this.qty, this.unit_name);
    }

    protected override buildActions(): NxAction[] { return getInvoiceItemActions(this) }

    setParent = (_: Serializable): void => {
        if (_ instanceof Company) { this.update({ company_id: _.id, invoice_id: null, project_id: null }).subscribe(() => { _.invoice_items.push(this); _.patch({}); }); return; }
        if (_ instanceof Project) { this.update({ company_id: null, invoice_id: null, project_id: _.id }).subscribe(() => { _.invoice_items.push(this); _.patch({}); }); return; }
        if (_ instanceof Invoice) { this.update({ company_id: null, invoice_id: _.id, project_id: null }).subscribe(() => { _.invoice_items.push(this); _.patch({}); }); return; }
        console.error('setting parent class ' + _.class + ' is not implemented yet for model InvoiceItem');
    };

    isRegularItem = () => [InvoiceItemType.Default, InvoiceItemType.Optional, InvoiceItemType.Inactive].includes(this.type);
    willAddToSum = () => [InvoiceItemType.Default, InvoiceItemType.Discount, InvoiceItemType.Paydown, InvoiceItemType.Instalment].includes(this.type);
    hasNumbering = () => this.willAddToSum() || this.type === InvoiceItemType.Optional;

    hasVatExceptionWithoutId = (company?: Company) => this.vat_rate === 0 && company?.needs_vat_handling && !(company ?? this.company).vat_id;
    hasVatDespiteId = (company?: Company) => this.vat_rate > 0 && ((company ?? this.company)?.vat_id ?? false);
    hasVatWhenNotNeeded = (company?: Company) => this.vat_rate > 0 && !(company ?? this.company)?.needs_vat_handling;
    hasImplausibleVat = (company?: Company) => this.hasVatDespiteId(company) || this.hasVatExceptionWithoutId(company) || this.hasVatWhenNotNeeded(company);
    frontendEqualsBackend = (): boolean => this._total == this.total;
    frontendEqualsBackendHover = () => (this.frontendEqualsBackend() ? '' : `frontend value (${this._total} not equal to backend value (${this.total})`);

    effectiveExtIssue = () => effectiveExtIssueOf(this);

    getRepeatString = () => InvoiceItemType[this.type];
    getYearlyPrice = (): number => {
        const type = this.type as InvoiceItemTypeRepeating;
        return type in REPEATING_MULT ? REPEATING_MULT[type] * this.price : 0;
    };
    getRepeatColor = (): string => getInvoiceItemTypeRepeatColor(this.type);
    deletePrediction = () =>
        nx().service.delete(`invoice_items/${this.id}/predict`).pipe(
            map(() => {
                this.my_prediction = null;
                Toast.success('Successfully deleted');
                return this;
            }),
        );

    getTemplate = (...args: unknown[]) => {
        return deepMerge(InvoiceItem.fromJson(nx().payloadFor(deepCopy(this), InvoiceItem, ['product_id'])) as unknown as Dictionary, ...(args as Dictionary[]));
    };
    updateDynamicAttributes() {
        this.price_discounted = Math.round(this.price * (100 - this.discount)) * 0.01;
        this.vat_rate_dec = 0.01 * this.vat_rate;
        this.unit_factor = this.unit_name === '%' ? 0.01 : 1;
        this.total = this.price_discounted * this.qty * this.unit_factor;
        this.net = this.vat_calculation === 0 ? this.total : Math.round((100 * this.total) / (1 + this.vat_rate_dec)) * 0.01;
        this.gross = this.vat_calculation === 1 ? this.total : Math.round(100 * this.total * (1 + this.vat_rate_dec)) * 0.01;
        this.vat = this.gross - this.net;
    }
    onEdit(success?: (v: unknown) => void, nxContext?: { company?: Company }) {
        const editItem = InvoiceItem.fromJson(this.snapshot());
        switch (editItem.type) {
            case InvoiceItemType.Header: {
                nx().promptInput('@i18n.common.title').confirmed(({ text }) => {
                    editItem.text = text;
                    if (!this.isNonPersistantRecord) {
                        editItem?.update().subscribe(() => {
                            this.fromJson(editItem.snapshot());
                            nx().broadcast({ type: TBroadcast.Update, data: this });
                            success?.(editItem);
                        });
                    } else {
                        this.fromJson(editItem.snapshot());
                        nx().broadcast({ type: TBroadcast.Update, data: this });
                        success?.(editItem);
                    }
                });
                break;
            }
            default: {
                const company = nxContext?.company || this.company;
                nx().openModal(MODAL.editInvoiceItem, editItem, company, 'Save')
                    .then((result: unknown) => {
                        const _ = result as { item?: InvoiceItem } | undefined;
                        if (_ && _.item instanceof InvoiceItem) {
                            if (!this.isNonPersistantRecord) {
                                _.item.update().subscribe(() => {
                                    this.fromJson(_.item!.snapshot());
                                    this.updateDynamicAttributes();
                                    nx().broadcast({ type: TBroadcast.Update, data: this });
                                    success?.(_);
                                });
                            } else {
                                this.fromJson(_.item!.snapshot());
                                this.updateDynamicAttributes();
                                nx().broadcast({ type: TBroadcast.Update, data: this });
                                success?.(_);
                            }
                        }
                    });
                break;
            }
        }
    }

    applyProduct(product: Product, company?: Company): void {
        if (!product.invoice_items.length) {
            this.product_source_id = product.id;
            this.product_source = Product.fromJson(product.snapshot());
            return;
        }
        const template = InvoiceItem.fromJson(product.getInvoiceItem()!.snapshot());
        if (company) {
            template.discount = parseFloat(company.getParam('INVOICE_DISCOUNT') ?? '0');
            if (company.isVatExcempt()) template.vat_rate = 0;
        }
        if (product.time_based > 0) {
            template.price = parseFloat(nx().global.setting('INVOICE_HOURLY_WAGE'));
            template.unit_name = nx().global.setting('INVOICE_HOUR_UNIT');
            if (product.time_based == 8) {
                template.price *= parseFloat(nx().global.setting('INVOICE_HPD'));
                template.unit_name = nx().global.setting('INVOICE_DAY_UNIT');
            }
            template.price *= product.price_multiplier || 1;
            if (company) template.vat_rate = company.vatRate();
        }
        this.product_source_id = product.id;
        this.price = template.price;
        this.unit_name = template.unit_name;
        this.vat_rate = template.vat_rate;
        this.discount = template.discount;
        this.is_discountable = template.is_discountable;
        this.vat_calculation = template.vat_calculation;
        if (!this.text) this.text = template.text || product.name;
        this.product_source = Product.fromJson(product.snapshot());
    }

    static parentField(_: Serializable): string | undefined {
        if (_ instanceof Project) return 'project_id';
        if (_ instanceof Company) return 'company_id';
        if (_ instanceof Invoice) return 'invoice_id';
        if (_ instanceof Product) return 'product_id';
        return undefined;
    }

    /**
     * @param qty - Quantity from the invoice item
     * @param unitName - Unit name from the invoice item (PT = "Personen-Tage" / person days)
     * @returns Person days value in standardized units
     */
    #calculatePersonDays(qty: number, unitName: string): number {
        if (!unitName) return 0;

        const normalizedUnit = unitName.toLowerCase();

        const dayUnit = nx().global?.setting('INVOICE_DAY_UNIT') || 'DAYS';
        const hourUnit = nx().global?.setting('INVOICE_HOUR_UNIT') || 'HOURS';
        const dayUnits = ['PT', 'DAYS', 'TAGE', 'TAG', 'DAY', 'D', dayUnit].map((u) => u.toLowerCase());
        const hourUnits = ['HOURS', 'HRS', 'STD', 'STUNDEN', 'STUNDE', 'H', 'HOUR', hourUnit].map((u) => u.toLowerCase());

        if (dayUnits.some((unit) => normalizedUnit === unit || normalizedUnit === unit + '.')) {
            return qty;
        }
        if (hourUnits.some((unit) => normalizedUnit === unit || normalizedUnit === unit + '.')) {
            return qty / HOURS_PER_PERSON_DAY;
        }
        return 0;
    }
}
