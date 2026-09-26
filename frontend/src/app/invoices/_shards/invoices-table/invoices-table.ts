import { Page } from '@models/http/http.talvis';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Invoice } from '@models/invoice/invoice.model';
import { FileService } from '@models/file/file.service';
import { GlobalService } from '@models/global.service';
import { InvoiceReminder } from '@models/invoice/invoice-reminder.model';
import { Observable } from 'rxjs';
import { DatePipe } from '@angular/common';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { ProgressBarComponent } from '@shards/progress-bar/progress-bar.component';
import { MoneyPipe } from '@pipes/money.pipe';
import { ContinuousMarkerComponent } from '@shards/continuous/continuous.marker.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    selector: 'invoices-table',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './invoices-table.html',
    imports: [StackedTableDirective, DatePipe, Nx, NComponent, AvatarComponent, ProgressBarComponent, MoneyPipe, ContinuousMarkerComponent, NgbTooltipModule],
})
export class InvoicesTable {
    invoices = input<Invoice[]>([]);
    observer = input<Observable<Page<Invoice>>>();
    context = input<string>('invoice.table');

    #fileService = inject(FileService);
    #global = inject(GlobalService);

    _invoices = signal<Invoice[]>([]);
    selection = signal<Invoice[]>([]);
    selectionNet = signal<number>(0);
    selectionGross = signal<number>(0);

    net = computed(() => this._invoices().reduce((sum, i) => sum + i.net, 0));
    gross = computed(() => this._invoices().reduce((sum, i) => sum + i.gross, 0));
    gross_remaining = computed(() => this._invoices().reduce((sum, i) => sum + i.gross_remaining, 0));
    maxPaymentDuration = computed(() => {
        let max = 1;
        for (const i of this._invoices()) {
            if (i.paid_at) max = Math.max(max, i.time_paid().diff(i.createdAt(), 'day'));
        }
        return max;
    });

    constructor() {
        effect(() => {
            this._invoices.set(this.observer() ? [] : this.invoices());
        });

        this.#global
            .onSelectionIn(() => this._invoices(), 'net', 'gross')
            .pipe(takeUntilDestroyed())
            .subscribe(([sel, net, gross]) => {
                this.selection.set(sel as Invoice[]);
                this.selectionNet.set(net as number);
                this.selectionGross.set(gross as number);
            });
    }

    onResult(data: Invoice[]) {
        this._invoices.update((inv) => [...inv, ...data]);
    }

    onActionsResolved = () => this._invoices.update((inv) => [...inv]);

    openFile = (inv: Invoice | InvoiceReminder) => this.#fileService.download(inv);
    percentForPaid = (_: Invoice) => _.time_paid().diff(_.createdAt(), 'day') / this.maxPaymentDuration();
    getCancellationName = (_: Invoice) => (_.cancelles ? this.#global.setting('INVOICE_CANCEL_TITLE') + ' von ' + _.cancelles.name : '');
    getCancelledByName = (_: Invoice) => (_.cancelled_by ? this.#global.setting('INVOICE_CANCEL_TITLE') + ': ' + _.cancelled_by.name : '');
}
