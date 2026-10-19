import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';
import { Company } from '@models/company/company.model';
import { WIDGET_SHARED } from '../widgets.shared';
import { ShortPipe } from '@pipes/short.pipe';
import { PermissionsDirective } from '@directives/permissions.directive';
import { WidgetService } from '@models/widget.service';
import { ParamChartSeriesDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';


@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-customer-support',
    templateUrl: './widget-customer-support.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, ShortPipe, PermissionsDirective],
})
export class WidgetCustomerSupportComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        ...WidgetOptions.maxItems,
        ...WidgetOptions.onlyMine,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) => this.#widgetService.indexCashflow('CUSTOMER_SUPPORT', { ...options, withChart: '1' }, Company));
    readonly data = computed<Company[]>(() =>
        [...(this.#cashflow.value()?.objects ?? [])].sort((a, b) => (b.foci_unbilled_sum_duration ?? 0) - (a.foci_unbilled_sum_duration ?? 0)),
    );
    readonly chartData = computed<ParamChartSeriesDto[] | undefined>(() => this.#cashflow.value()?.history);
    override value = this.headline(this.#cashflow, () => this.data().reduce((a, b) => a + (b.foci_unbilled_sum_duration ?? 0), 0));
}
