import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Invoice } from '@models/invoice/invoice.model';
import { dayjs } from '@constants/date/dates';
import { Color } from '@constants/Color';
import { InvoiceDetailChartOptions } from './invoice-detail-chart-options';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { InvoiceDetailGuard } from '@app/invoices/invoice-detail.guard';
import { InvoiceReminder } from '@models/invoice/invoice-reminder.model';
import { FileService } from '@models/file/file.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { DatePipe } from '@angular/common';
import { NComponent } from '@shards/n/n.component';
import { InvoicePrepare } from '@app/invoices/_shards/invoice-prepare/invoice-prepare';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { MoneyPipe } from '@pipes/money.pipe';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { ModalInvoiceAddInstalmentComponent } from '@app/_modals/modal-invoice-add-instalment/modal-invoice-add-instalment.component';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'invoice-dashboard',
    templateUrl: './invoice-dashboard.component.html',
    imports: [ValueUnitComponent, ToolbarComponent, ScrollbarComponent, DatePipe, NComponent, InvoicePrepare, NgbTooltipModule, MoneyPipe, MoneyShortPipe],
})
export class InvoiceDashboardComponent {
    readonly parent = inject(InvoiceDetailGuard);
    readonly invoice = this.parent.object;
    readonly options = computed(() => {
        const inv = this.invoice();
        if (!inv) return InvoiceDetailChartOptions;
        const paid_at = inv.paid_at ? inv.time_paid() : dayjs();
        return {
            ...InvoiceDetailChartOptions,
            series: [
                { name: $localize`:@@i18n.invoices.created:Created`, data: [[inv.createdAt().unix() * 1000, 1]], color: Color.fromVar('orange').toHexString() },
                { name: $localize`:@@i18n.invoices.due:Due`, data: [[inv.time_due().unix() * 1000, 2]], color: Color.fromVar('red').toHexString() },
                ...(inv.paid_at ? [{ name: $localize`:@@i18n.invoices.paid:Paid`, data: [[inv.time_paid().unix() * 1000, 3]], color: Color.fromVar('green').toHexString() }] : []),
            ],
            xaxis: { ...InvoiceDetailChartOptions.xaxis, type: 'datetime', min: inv.createdAt().unix() * 1000, max: paid_at.unix() * 1000 },
        };
    });

    #modalService = inject(ModalBaseService);
    #fileService = inject(FileService);

    onInstalmentButtonClicked() {
        this.#modalService
            .open(ModalInvoiceAddInstalmentComponent, this.invoice())
            .then((item) => {
                if (item) item.store().subscribe(() => this.parent.reload());
            });
    }

    openFile = (inv: Invoice | InvoiceReminder) => this.#fileService.download(inv);
}
