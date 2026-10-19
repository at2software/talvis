import { ChangeDetectionStrategy, Component, computed, inject, ResourceRef } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { BaseWidgetComponent } from '../base.widget.component';
import { OptionType } from '../widget-options/widget-options.component';
import { WIDGET_SHARED } from '../widgets.shared';
import { Project } from '@models/project/project.model';
import type { ProjectTimelineEntryDto } from '@models/_core/api-response';
import { ProjectService } from '@models/project/project.service';
import { WidgetService } from '@models/widget.service';
import { Color } from '@constants/Color';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS, ECHARTS_DONUT_CENTER_TEXT, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES, ECHARTS_DONUT_TRACK_COLOR } from '@charts/echarts-presets';
import { ChartProgressComponent } from '@charts/chart-progress/chart-progress.component';
import { MILESTONE_STATES } from '@models/milestone/milestone-state.enum';
import { ProjectState } from '@models/project/project-state.model';
import type { EChartsOption } from 'echarts';
import type { TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface WorkShare { name: string; color: string; val: number; }
interface MilestoneStateCount { name: string; count: number; color: string; }

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-project-analysis',
    templateUrl: './widget-project-analysis.component.html',
    styleUrls: ['./widget-project-analysis.component.scss', './../base.widget.component.scss'],
    imports: [...WIDGET_SHARED, ChartProgressComponent, SpinnerComponent],
})
export class WidgetProjectAnalysisComponent extends BaseWidgetComponent {
    #projectService = inject(ProjectService);
    #widgetService = inject(WidgetService);

    defaultOptions = () => ({
        'project-id': { type: OptionType.String, value: '', i18n: $localize`:@@i18n.common.projectId:project ID` },
    });

    #hasProjectId = () => !!this.getOptions()['project-id']?.value;

    readonly #project = this.optionsResource((options) => this.#projectService.show(String(options['project-id'])), this.#hasProjectId);
    readonly #runningProjects = this.optionsResource(() => this.#widgetService.indexCashflow('PROJECTS', {}, Project), () => !this.#hasProjectId());

    readonly project = computed<Project | null>(() => {
        const project = this.#project.value();
        if (!project) return null;
        this.#computeWorkshares(project);
        return project;
    });
    readonly runningProjects = computed<Project[]>(() => this.#runningProjects.value()?.objects ?? []);
    readonly loaded = computed(() => {
        const resource: ResourceRef<unknown> = this.#hasProjectId() ? this.#project : this.#runningProjects;
        return resource.hasValue() || resource.status() === 'error';
    });
    readonly milestoneStates = computed<MilestoneStateCount[]>(() => {
        const project = this.project();
        return project ? this.#computeMilestoneStates(project) : [];
    });

    readonly #budgetChart = computed(() => (this.#shouldShowBudgetChart() ? this.#buildBudgetChart() : null));
    readonly budgetChartOptions = computed<EChartsOption | null>(() => this.#budgetChart()?.options ?? null);
    readonly budgetWrapperStyle = computed<Dictionary>(() => this.#budgetChart()?.wrapperStyle ?? {});

    selectProject(project: Project): void {
        const newOptions = { ...this.getOptions() };
        newOptions['project-id'] = { ...newOptions['project-id'], value: project.id.toString() };
        this._onUpdate(newOptions);
    }

    #computeWorkshares(project: Project): void {
        project.var = project.var || ({} as Dictionary);
        project.var['workshares'] = (project.timeline_chart || []).map((_: ProjectTimelineEntryDto) => ({
            name: _.user?.name || 'Unknown',
            color: _.user?.color || '#cccccc',
            val: _.data.reduce((sum: number, d) => sum + (parseFloat(String(d.value)) || 0), 0),
        } as WorkShare));
    }

    #shouldShowBudgetChart(): boolean {
        const p = this.project();
        if (!p) return false;
        return !p.is_time_based && !p.is_internal &&
            (p.state.progress === ProjectState.ProgressRunning || p.state.progress === ProjectState.ProgressFinished) &&
            p.var?.workshares?.length > 0 && p.worksharesTotal() > 0 && (p.work_estimated ?? 0) > 0;
    }

    #buildBudgetChart() {
        const project = this.project()!;
        const timePercentage = project.timePercentage();
        const dangerColor = Color.fromVar('danger').toHexString();
        const workShares: WorkShare[] = project.var['workshares'] || [];
        const centerText = `${(timePercentage * 100).toFixed(0)}%`;
        const centerColor = timePercentage >= 1 ? dangerColor : '#ffffff';

        const pieData = timePercentage < 1
            ? [...workShares.map((u) => ({ value: u.val, name: u.name, itemStyle: { color: u.color, ...ECHARTS_DONUT_ITEM_STYLE } })), { value: (project.work_estimated ?? 0) - project.hours_invested, name: 'remaining', itemStyle: { color: ECHARTS_DONUT_TRACK_COLOR, ...ECHARTS_DONUT_ITEM_STYLE } }]
            : workShares.map((u) => ({ value: u.val, name: u.name, itemStyle: { color: u.color, ...ECHARTS_DONUT_ITEM_STYLE } }));

        return {
            options: {
                backgroundColor: 'transparent',
                animation: false,
                tooltip: { trigger: 'item', ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS, formatter: (params: TopLevelFormatterParams) => { const p = Array.isArray(params) ? params[0] : params; return `${p.name}: ${(p.value as number).toFixed(1)}h`; } },
                graphic: [{ type: 'text', left: 'center', top: 'center', style: { ...ECHARTS_DONUT_CENTER_TEXT, text: centerText, fill: centerColor, fontFamily: 'BrunoAce' } }],
                series: [{ ...ECHARTS_DONUT_SERIES, data: pieData }],
            } satisfies EChartsOption,
            wrapperStyle: (timePercentage >= 1
                ? { '--budget-over-percentage': `${Math.min(timePercentage - 1, 1) * 360}deg`, '--budget-danger-color': dangerColor }
                : {}) as Dictionary,
        };
    }

    #computeMilestoneStates(project: Project) {
        if (!project.milestone_state_counts) return [];
        return [
            { ...MILESTONE_STATES[2], count: project.milestone_state_counts.done },
            { ...MILESTONE_STATES[1], count: project.milestone_state_counts.in_progress },
            { ...MILESTONE_STATES[0], count: project.milestone_state_counts.todo },
        ].filter((s) => s.count > 0);
    }

    getMilestoneTotal = () => this.project()?.milestone_state_counts?.total || 0;
    getMilestonePerc = (count: number) => this.getMilestoneTotal() > 0 ? (100 * count) / this.getMilestoneTotal() : 0;
}
