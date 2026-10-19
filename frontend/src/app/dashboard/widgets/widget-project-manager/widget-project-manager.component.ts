import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Project } from '@models/project/project.model';
import { BaseWidgetComponent, WidgetOptions } from '../base.widget.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { PermissionsDirective } from '@directives/permissions.directive';
import { WidgetService } from '@models/widget.service';
import { forkJoin } from 'rxjs';
import { ParamChartSeriesDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-project-manager',
    templateUrl: './widget-project-manager.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, PermissionsDirective],
})
export class WidgetProjectManagerComponent extends BaseWidgetComponent {
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        ...WidgetOptions.onlyMine,
        ...WidgetOptions.onlyMineAsPm,
        ...WidgetOptions.chartOnly,
    });

    readonly #cashflow = this.optionsResource((options) => {
        const query = { ...options };
        delete query['max-items'];
        if (this.hasInvoicesModule()) query['withChart'] = '1';
        return forkJoin({
            acquisitions: this.#widgetService.indexCashflow('PROJECTS_ACQUISITIONS', query, Project),
            projects: this.#widgetService.indexCashflow('PROJECTS', query, Project),
        });
    });

    readonly #acquisitions = computed<Project[]>(() => (this.#cashflow.value()?.acquisitions.objects ?? []).map((p) => { p.var.projectType = 'acquisition'; return p; }));
    readonly #projects = computed<Project[]>(() => (this.#cashflow.value()?.projects.objects ?? []).map((p) => { p.var.projectType = 'running'; return p; }));

    readonly data = computed<Project[]>(() =>
        [...this.#acquisitions(), ...this.#projects()].sort((a, b) => this.getDisplayValue(b) - this.getDisplayValue(a)),
    );
    readonly chartData = computed<ParamChartSeriesDto[]>(() => {
        const response = this.#cashflow.value();
        if (!response?.projects.history || !response.acquisitions.history) return [];
        return [[response.projects.history].flat()[0], [response.acquisitions.history].flat()[0]];
    });
    override value = this.headline(this.#cashflow, () => this.#acquisitions().reduce((a, b) => a + (b.net ?? 0), 0) + this.#projects().reduce((a, b) => a + (b.net_remaining ?? 0), 0));

    getProbabilityTooltip = (project: Project) =>
        $localize`:@@i18n.common.probability:probability` + ': ' + ((project.lead_probability || 0) * 100).toFixed(1) + '%';

    isCompact = (project: Project) => !project.getBadge();
    getDisplayValue = (project: Project) => project.var.projectType === 'acquisition' ? project.net : project.net_remaining;
}
