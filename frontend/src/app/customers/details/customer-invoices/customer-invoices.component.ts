import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { tracked } from '@constants/tracked';
import { InvoiceService } from '@models/invoice/invoice.service';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { CustomerPaymentDetailsComponent } from '@app/customers/_shards/customer-payment-details/customer-payment-details.component';
import { InvoicesTable } from '@app/invoices/_shards/invoices-table/invoices-table';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'customer-invoices',
    templateUrl: './customer-invoices.component.html',
    imports: [ScrollbarComponent, CustomerPaymentDetailsComponent, InvoicesTable, EmptyStateComponent, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerInvoicesComponent {
    #parent = inject(CustomerDetailGuard);
    #invoiceService = inject(InvoiceService);

    #company = tracked(this.#parent.object);
    observer = computed(() => this.#invoiceService.indexPaginated({ company_id: this.#company().id }));
}
