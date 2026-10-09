import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, TemplateRef, computed, effect, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Nx } from '@app/nx/nx.directive';
import { NgbDateAdapter, NgbDatepickerModule, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { SaldoChartComponent } from '@shards/saldo-chart/saldo-chart.component';
import { dayjs } from '@constants/date/dates';
import { NgbDateCarbonAdapter } from '@directives/ngb-date.adapter';
import { CashService } from '@models/cash/cash.service';
import { modelListResource } from '@models/http/model-resource';
import { GlobalService } from '@models/global.service';
import { MoneyPipe } from '@pipes/money.pipe';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'invoices-cash-register-detail',
    templateUrl: './invoices-cash-register-detail.component.html',
    styleUrls: ['./invoices-cash-register-detail.component.scss'],
    providers: [{ provide: NgbDateAdapter, useClass: NgbDateCarbonAdapter }],
    imports: [StackedTableDirective, ToolbarComponent, Nx, SaldoChartComponent, NgbDatepickerModule, FormsModule, MoneyPipe, DatePipe, HotkeyDirective],
})
export class InvoicesCashRegisterDetailComponent {

    #global = inject(GlobalService);
    #route = inject(ActivatedRoute);
    #cashService = inject(CashService);
    #modalService = inject(NgbModal);

    id = signal('');

    readonly #entries = modelListResource(
        () => this.id() || undefined,
        (id) => this.#cashService.indexEntries(id),
    );
    entries = this.#entries.value;

    balanceBefore = computed(() => {
        const result = new Map<string, number>();
        let balance = 0;
        for (const e of [...this.entries()].reverse()) {
            e.snapshot();
            result.set(e.id, balance);
            balance += e.value;
        }
        return result;
    });
    min = computed(() => this.entries().reduce((m, e) => Math.min(m, this.balanceBefore().get(e.id)! + e.value), 0));
    max = computed(() => this.entries().reduce((m, e) => Math.max(m, this.balanceBefore().get(e.id)! + e.value), 0));
    currencySymbol = computed(() => this.#global.currencySymbol() ?? '€');

    modalData = signal({
        occured_at: dayjs().toISOString(),
        description: '',
        approver: '',
        value: 0,
    });

    constructor() {
        this.#route.params.pipe(takeUntilDestroyed()).subscribe(p => this.id.set(p['id']));

        effect(() => {
            if (!this.id()) return;
            this.modalData.set({
                occured_at: dayjs().toISOString(),
                description: '',
                approver: this.#global.user?.getName() ?? '',
                value: 0,
            });
        });
    }

    reload = () => this.#entries.reload();

    addExpense(content: TemplateRef<unknown>) {
        this.#modalService
            .open(content, { ariaLabelledBy: 'modal-basic-title' })
            .result.then(() => {
                this.#cashService.storeEntry(this.id(), this.modalData()).subscribe(() => this.reload());
            })
            .catch();
    }
}
