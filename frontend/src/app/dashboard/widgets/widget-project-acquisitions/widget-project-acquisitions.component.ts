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
    selector: 'widget-project-acquisitions',
    templateUrl: './widget-project-acquisitions.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetProjectAcquisitionsComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        ...WidgetOptions.maxItems,
        ...WidgetOptions.onlyMine,
        ...WidgetOptions.onlyMineAsPm,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) =>
        this.#widgetService.indexCashflow('PROJECTS_ACQUISITIONS', this.hasInvoicesModule() ? { ...options, withChart: '1' } : options, Project),
    );
    readonly data = computed<Project[]>(() => [...(this.#cashflow.value()?.objects ?? [])].sort((a, b) => (b.net ?? 0) - (a.net ?? 0)));
    readonly chartData = computed<ParamChartSeriesDto[] | undefined>(() => this.#cashflow.value()?.history);
    override value = this.headline(this.#cashflow, () => this.data().reduce((a, b) => a + (b.net ?? 0), 0));

    getProbabilityTooltip = (project: Project) =>
        $localize`:@@i18n.common.probability:probability` + ': ' + ((project.lead_probability || 0) * 100).toFixed(1) + '%';
}
