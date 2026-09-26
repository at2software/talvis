import { InvoiceItemType } from '@enums/invoice-item.type';
import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { tracked } from '@constants/tracked';
import { ModalEditInvoiceItemComponent } from '@app/_modals/modal-edit-invoice-item/modal-edit-invoice-item.component';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { dayjs } from '@constants/date/dates';
import { InvoicesStandingComponent } from '@app/invoices/-/invoices-standing/invoices-standing.component';
import { CustomerDetailGuard } from '../../customers.details.guard';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseService } from '@app/_modals/modal-base-service';

@Component({
    selector: 'customer-standing-orders',
    templateUrl: './customer-standing-orders.component.html',
    imports: [ToolbarComponent, InvoicesStandingComponent, NgbDropdownModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerStandingOrdersComponent {
    #parent = inject(CustomerDetailGuard);
    #modal = inject(ModalBaseService);

    company = tracked(this.#parent.object);
    standing = viewChild.required(InvoicesStandingComponent);

    readonly InvoiceItemType = InvoiceItemType;

    onCreate(rec: InvoiceItemType) {
        const item = InvoiceItem.fromJson({});
        const company = this.company();
        this.#modal.open(ModalEditInvoiceItemComponent, item, company).then((response) => {
            if (response?.item) {
                response.item.type = rec;
                response.item.next_recurrence_at = dayjs().toISOString();
                response.item.company_id = company.id;
                response.item.store().subscribe(() => this.standing().reload());
            }
        });
    }
}
