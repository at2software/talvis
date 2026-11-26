import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalBaseComponent } from '../modal-base.component';
import { InvoiceItemType, REPEATING_TYPES, INVOICE_ITEM_REPEAT_LABELS } from '@enums/invoice-item.type';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Company } from '@models/company/company.model';
import { Product } from '@models/product/product.model';
import { InvoiceItem } from '@models/invoice/invoice-item.model';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-create-audit-invoice-item',
    imports: [FormsModule, SpinnerComponent],
    templateUrl: './modal-create-audit-invoice-item.component.html',
})
export class ModalCreateAuditInvoiceItemComponent extends ModalBaseComponent<InvoiceItem | null> {
    company?: Company;
    #created: InvoiceItem | null = null;
    saving = signal(false);

    name = signal('');
    price = signal(0);
    unit_name = signal('month');
    type = signal(InvoiceItemType.Monthly);
    next_recurrence_at = signal(new Date().toISOString().slice(0, 10));

    readonly typeOptions = REPEATING_TYPES.map((t) => ({ value: t, label: INVOICE_ITEM_REPEAT_LABELS[t] }));

    init(company: Company, product?: Product) {
        this.company = company;
        if (product) {
            const item = product.invoice_items?.[0];
            if (item) {
                this.name.set(item.text || product.name || '');
                this.price.set(item.net ?? item.price ?? 0);
                this.unit_name.set(item.unit_name || 'month');
                if ((REPEATING_TYPES as readonly InvoiceItemType[]).includes(item.type)) this.type.set(item.type);
            } else {
                this.name.set(product.name || '');
            }
        }
    }

    onSuccess(): InvoiceItem | null {
        return this.#created;
    }

    readonly canSave = computed(() => !!this.name().trim() && this.price() > 0 && !!this.next_recurrence_at());

    save() {
        if (!this.canSave()) return;
        this.saving.set(true);
        InvoiceItem.fromJson({})
            .store({
                name: this.name(),
                price: this.price(),
                unit_name: this.unit_name(),
                type: this.type(),
                next_recurrence_at: this.next_recurrence_at(),
                company_id: this.company?.id,
            })
            .subscribe({
                next: (item) => {
                    this.#created = item;
                    this.saving.set(false);
                    this.accept();
                },
                error: () => {
                    this.saving.set(false);
                },
            });
    }
}
