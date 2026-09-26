import { Page } from '@models/http/http.talvis';
import { ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { CASHFLOW_CHART_CHARTS, CASHFLOW_CHART_I18N, CASHFLOW_CHART_ICONS, CASHFLOW_CHART_KEYS } from '@dashboard/widgets/widget-cashflow/widget-cashflow.options';
import { InvoiceService } from '@models/invoice/invoice.service';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ContinuousMarkerComponent } from '@shards/continuous/continuous.marker.component';
import { DndDirective } from '@directives/dnd.directive';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { MoneyPipe } from '@pipes/money.pipe';
import { Expense } from '@models/expense/expense.model';
import { StackedTableDirective } from '@directives/stacked-table.directive';

interface TKeyData {
    key: string;
    data: { id: number; value: number }[];
}
interface TDay {
    day: string;
    values: TKeyData[];
}

@Component({
    selector: 'invoices-cash-flow',
    templateUrl: './invoices-cash-flow.component.html',
    styleUrls: ['./invoices-cash-flow.component.scss'],
    imports: [StackedTableDirective, NgbTooltipModule, ContinuousMarkerComponent, MoneyPipe, DndDirective, EmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicesCashFlowComponent {
    data = model<TDay[]>([]);
    readonly keys = CASHFLOW_CHART_KEYS;
    observer = signal<Observable<Page<Expense>> | undefined>(undefined);

    #invoiceService = inject(InvoiceService);

    constructor() {
        this.observer.set(this.#invoiceService.showCashFlow());
    }

    onResult(data: Expense[]) {
        const _d = this.data();
        data.forEach((d) => {
            const date = d.createdAt().format('YYYY-MM-DD');
            if (!this.keys.includes(d.key)) console.warn('Unknown cashflow key: ' + d.key, this.keys);
            let day: TDay | undefined = _d.find((_) => _.day === date);
            if (!day) {
                day = { day: date, values: [] };
                _d.push(day);
            }
            let key = this.valuesFor(day, d.key);
            if (!key) {
                key = { key: d.key, data: [] };
                day.values.push(key);
            }
            key.data.push({ id: +d.id, value: d.value });
        });
        this.data.set(_d);
    }

    valuesFor = (day: TDay, key: string) => day.values.find((_) => _.key === key);
    i18n = (key: string) => CASHFLOW_CHART_I18N[key];
    color = (key: string) => CASHFLOW_CHART_CHARTS[key];
    hasKey = (a: object, key: string) => key in a;
    headerIconFor = (key: string) => CASHFLOW_CHART_ICONS[key] || key;

    onCsvUploaded = () => {
        this.data.set([]);
        this.observer.set(this.#invoiceService.showCashFlow());
    };
}
