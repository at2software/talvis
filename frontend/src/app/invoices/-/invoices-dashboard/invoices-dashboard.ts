import { Page } from '@models/http/http.talvis';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InvoicesTable } from '@app/invoices/_shards/invoices-table/invoices-table';
import { ContinuousMarkerComponent } from '@shards/continuous/continuous.marker.component';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { Observable } from 'rxjs';
import { Dictionary, StartEnd } from '@constants/constants';
import { DATESPAN_RANGE } from '@constants/date/dateSpanRange';
import { Invoice } from '@models/invoice/invoice.model';
import { InvoiceService } from '@models/invoice/invoice.service';
import { WidgetInvoiceManagerComponent } from '@dashboard/widgets/widget-invoice-manager/widget-invoice-manager.component';
import { GlobalService } from '@models/global.service';
import { Router } from '@angular/router';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { Serializable } from '@models/_core/serializable';
import { Company } from '@models/company/company.model';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalSepaDirectDebitComponent } from '@app/_modals/modal-sepa-direct-debit/modal-sepa-direct-debit.component';

@Component({
    selector: 'invoices-dashboard',
    templateUrl: './invoices-dashboard.html',
    imports: [FormsModule, InvoicesTable, ContinuousMarkerComponent, NgxDaterangepickerMd, EmptyStateComponent, WidgetInvoiceManagerComponent, SearchInputComponent, NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicesDashboard {
    #invoiceService = inject(InvoiceService);
    #router = inject(Router);
    #modal = inject(ModalBaseService);
    global = inject(GlobalService);

    invoices = signal<Invoice[]>([]);
    hasLoaded = signal(false);
    onlyUnpaid = signal(true);
    onlyPaid = signal(false);
    selCreated = signal<StartEnd>(null!);
    selPaid = signal<StartEnd>(null!);
    observer = signal<Observable<Page<Invoice>> | undefined>(undefined);

    readonly ranges = DATESPAN_RANGE;
    #currentFilter = '';

    constructor() {
        this.reload();
    }

    reload() {
        const filters: Dictionary = Object.assign({}, this.#filters());
        const filterStr = JSON.stringify(filters);
        if (filterStr === this.#currentFilter) return;
        this.#currentFilter = filterStr;
        this.invoices.set([]);
        this.hasLoaded.set(false);
        this.observer.set(this.#invoiceService.indexPaginated(filters));
    }

    openSepaDirectDebit() {
        this.#modal.open(ModalSepaDirectDebitComponent).then(() => {
            this.#currentFilter = '';
            this.reload();
        });
    }

    onCustomerSelected = (selected: Serializable) => {
        const company = selected.assert(Company);
        if (company) this.#router.navigate(['/customers', company.id, 'billing']);
    };

    onResult = (result: Invoice[]) => {
        this.hasLoaded.set(true);
        this.invoices.update((inv) => [...inv, ...result]);
    };

    #filters = () => ({
        onlyUnpaid: this.onlyUnpaid(),
        onlyPaid: this.onlyPaid(),
        createdStart: this.selCreated()?.startDate?.format('DD.MM.YYYY'),
        createdEnd: this.selCreated()?.endDate?.format('DD.MM.YYYY'),
        paidStart: this.selPaid()?.startDate?.format('DD.MM.YYYY'),
        paidEnd: this.selPaid()?.endDate?.format('DD.MM.YYYY'),
    });
}
