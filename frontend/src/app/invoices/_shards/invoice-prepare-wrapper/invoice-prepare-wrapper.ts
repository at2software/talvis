import { ChangeDetectionStrategy, Component, computed, input, output, signal, TemplateRef, viewChild } from '@angular/core';

import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { TextParamEditorComponent } from '@shards/text-param-editor/text-param-editor.component';
import { InvoicePrepare } from '@app/invoices/_shards/invoice-prepare/invoice-prepare';
import { InvoiceItemInfoMode } from '@app/invoices/_shards/invoice-prepare/invoice-item/invoice-item-row.component';
import { CustomerPaymentDetailsComponent } from '@app/customers/_shards/customer-payment-details/customer-payment-details.component';
import { Company } from '@models/company/company.model';
import { BillingConsiderationDto } from '@models/_core/api-response';
import { Project } from '@models/project/project.model';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { SafePipe } from '@pipes/safe.pipe';

@Component({
    selector: 'invoice-prepare-wrapper',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [NgbTooltipModule, TextParamEditorComponent, InvoicePrepare, CustomerPaymentDetailsComponent, SafePipe],
    templateUrl: './invoice-prepare-wrapper.html',
})
export class InvoicePrepareWrapper {
    parent = input.required<Company | Project>();
    items = input<InvoiceItem[] | undefined>(undefined);
    stageFilter = input<number | undefined>(undefined);
    infoType = input<InvoiceItemInfoMode>('invoice');
    showMiniCards = input<boolean>(true);
    additionalBillingConsiderations = input<BillingConsiderationDto[]>([]);
    allowedNewItems = input<('item' | 'paydown' | 'group' | 'discount')[]>(['item', 'paydown', 'group', 'discount']);
    withInstalments = input<boolean>(true);
    mode = input<'invoice' | 'quote'>('invoice');
    additionalItems = input<TemplateRef<unknown> | undefined>(undefined);
    projectPaymentDuration = input<string | undefined>(undefined);
    onChangeProjectPaymentDuration = input<(() => void) | undefined>(undefined);
    onRemoveProjectPaymentDuration = input<(() => void) | undefined>(undefined);
    considerationsChanged = output<BillingConsiderationDto[]>();

    readonly table = viewChild(InvoicePrepare);

    readonly allBillingConsiderations = signal<BillingConsiderationDto[]>([]);

    readonly prefixKey = computed(() => (this.mode() === 'quote' ? 'PROJECT_PREFIX' : 'INVOICE_PREFIX'));
    readonly suffixKey = computed(() => (this.mode() === 'quote' ? 'PROJECT_SUFFIX' : 'INVOICE_SUFFIX'));
    readonly #textParamTarget = computed(() => {
        const parent = this.parent();
        if (this.mode() === 'quote' && parent instanceof Project) {
            return { to: parent.personalized, object: parent };
        }
        const company = this.company();
        return { to: company, object: company };
    });
    readonly company = computed<Company>(() => (this.parent() instanceof Company ? (this.parent() as Company) : (this.parent() as Project).company));
    readonly prefixTo = computed(() => this.#textParamTarget().to);
    readonly prefixObject = computed(() => this.#textParamTarget().object);
    readonly companyLocale = computed(() => this.company()?.getLocale() ?? 'de-formal');
    readonly hasVatIssues = computed(() => this.allBillingConsiderations().some((c) => c.tooltip?.toLowerCase().includes('vat')));

    #recalculateBillingConsiderations(items: InvoiceItem[] = []) {
        const considerations = [...this.additionalBillingConsiderations()];
        const company = this.company();

        for (const item of items) {
            if (item.invoice_id) continue;
            if (!item.isRegularItem()) continue;

            if (item.hasVatDespiteId(company)) {
                considerations.push({ type: 'error', label: item.text, tooltip: 'item has VAT but company has VAT ID', invoice_item_id: item.id });
            }
            if (item.hasVatExceptionWithoutId(company)) {
                considerations.push({ type: 'error', label: item.text, tooltip: 'item has no VAT but company has no VAT ID', invoice_item_id: item.id });
            }
            if (item.hasVatWhenNotNeeded(company)) {
                considerations.push({ type: 'error', label: item.text, tooltip: 'item has VAT but company does not need VAT', invoice_item_id: item.id });
            }
        }

        setTimeout(() => {
            this.allBillingConsiderations.set(considerations);
            this.considerationsChanged.emit(considerations);
        });
    }

    handleTableLoaded(items: InvoiceItem[]) {
        this.#recalculateBillingConsiderations(items);
    }

    trackBillingConsideration(_index: number, item: BillingConsiderationDto) {
        return item.invoice_item_id || item.label + item.type || _index;
    }

    fixVatIssues() {
        const items = this.items() ?? this.table()?._items();
        if (!items) return;

        const company = this.company();
        const correctVatRate = company.vatRate();
        const itemsToFix = items.filter((item) => item.hasImplausibleVat(company));
        if (itemsToFix.length === 0) return;

        itemsToFix.forEach((item) => {
            item.vat_rate = correctVatRate;
            item.updateDynamicAttributes();
            item.update().subscribe();
        });

        setTimeout(() => {
            this.#recalculateBillingConsiderations(items);
            this.table()?.reload();
        }, 300);
    }
}
