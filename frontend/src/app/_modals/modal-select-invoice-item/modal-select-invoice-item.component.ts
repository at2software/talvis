import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { modelListResource } from '@models/http/model-resource';
import { DecimalPipe } from '@angular/common';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { InvoiceItemService } from '@models/invoice/invoice-item.service';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { InvoiceItemType, getInvoiceItemTypeRepeatColor, INVOICE_ITEM_REPEAT_LABELS } from '@enums/invoice-item.type';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-select-invoice-item',
    imports: [DecimalPipe, SpinnerComponent],
    templateUrl: './modal-select-invoice-item.component.html',
})
export class ModalSelectInvoiceItemComponent {
    activeModal = inject(NgbActiveModal);
    #service = inject(InvoiceItemService);

    readonly #items = modelListResource(() => this.#service.indexStandingOrders());
    items = this.#items.value;
    loading = this.#items.isLoading;

    typeLabel(type: number) {
        return INVOICE_ITEM_REPEAT_LABELS[type] ?? '';
    }
    typeColor(type: number) {
        return getInvoiceItemTypeRepeatColor(type as InvoiceItemType);
    }

    select(item: InvoiceItem) {
        this.activeModal.close(item);
    }
}
