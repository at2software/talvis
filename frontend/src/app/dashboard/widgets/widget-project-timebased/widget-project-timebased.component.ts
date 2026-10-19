import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Project } from '@models/project/project.model';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { ShortPipe } from '@pipes/short.pipe';
import { PermissionsDirective } from '@directives/permissions.directive';
import { WidgetService } from '@models/widget.service';
import { ParamChartSeriesDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-project-timebased',
    templateUrl: './widget-project-timebased.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, ShortPipe, PermissionsDirective],
})
export class WidgetProjectTimebasedComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        ...WidgetOptions.maxItems,
        ...WidgetOptions.onlyMine,
        ...WidgetOptions.onlyMineAsPm,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) => this.#widgetService.indexCashflow('PROJECTS_TIMEBASED', { ...options, withChart: '1' }, Project));
    readonly data = computed<Project[]>(() => {
        const sorted = [...(this.#cashflow.value()?.objects ?? [])].sort((a, b) => b.uninvoiced_hours - a.uninvoiced_hours);
        sorted.forEach((_) => (_.var.hidden = _.uninvoiced_hours == 0));
        return sorted;
    });
    readonly max = computed(() => Math.max(1, ...this.data().map((x) => x.uninvoiced_hours)));
    readonly chartData = computed<ParamChartSeriesDto[] | undefined>(() => this.#cashflow.value()?.history);
    override value = this.headline(this.#cashflow, () => this.data().reduce((a, b) => a + b.uninvoiced_hours, 0));
}
