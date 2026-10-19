import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WidgetService } from '@models/widget.service';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';
import { Invoice } from '@models/invoice/invoice.model';
import { dayjs } from '@constants/date/dates';
import { GlobalService } from '@models/global.service';
import { WIDGET_SHARED } from '../widgets.shared';
import { PermissionsDirective } from '@directives/permissions.directive';
import { ParamChartSeriesDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-unpaid-invoices',
    templateUrl: './widget-unpaid-invoices.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetUnpaidInvoicesComponent extends BaseWidgetComponent {
    global = inject(GlobalService);
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        ...WidgetOptions.maxItems,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) => this.#widgetService.indexCashflow('INVOICES', { ...options, withChart: '1' }, Invoice));
    readonly data = computed<Invoice[]>(() => {
        const sorted = [...(this.#cashflow.value()?.objects ?? [])]
            .map((x) => { x.actions[0].action = () => x.navigateTo(`/financial/${x.id}`); return x; })
            .sort((a, b) => a.time_remind().valueOf() - b.time_remind().valueOf());
        sorted.forEach((_) => (_.var.hidden = dayjs().diff(_.time_remind()) < 0));
        return sorted;
    });
    readonly chartData = computed<ParamChartSeriesDto[] | undefined>(() => this.#cashflow.value()?.history);
    override value = this.headline(this.#cashflow, () => this.data().reduce((a, b) => a + (b.gross_remaining ?? 0), 0));
}
