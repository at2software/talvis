import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Project } from '@models/project/project.model';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { PermissionsDirective } from '@directives/permissions.directive';
import { WidgetService } from '@models/widget.service';
import { ParamChartSeriesDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-project-running',
    templateUrl: './widget-project-running.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetProjectRunningComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        ...WidgetOptions.maxItems,
        ...WidgetOptions.onlyMine,
        ...WidgetOptions.onlyMineAsPm,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) =>
        this.#widgetService.indexCashflow('PROJECTS', this.hasInvoicesModule() ? { ...options, withChart: '1' } : options, Project),
    );
    readonly data = computed<Project[]>(() => [...(this.#cashflow.value()?.objects ?? [])].sort((a, b) => b.net_remaining - a.net_remaining));
    readonly chartData = computed<ParamChartSeriesDto[] | undefined>(() => this.#cashflow.value()?.history);
    override value = this.headline(this.#cashflow, () => this.data().reduce((a, b) => a + b.net_remaining, 0));
}
