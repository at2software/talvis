import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ChartProgressComponent } from '@charts/chart-progress/chart-progress.component';
import { PermissionsDirective } from '@directives/permissions.directive';
import { GlobalService } from '@models/global.service';
import { Project } from '@models/project/project.model';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { MoneyPipe } from '@pipes/money.pipe';
import { MILESTONE_STATES } from '@models/milestone/milestone-state.enum';
import { EchartsComponent } from '@charts/echarts-wrapper/echarts-wrapper.component';
import { Color } from '@constants/Color';
import { ECHARTS_DEFAULT_TOOLTIP_OPTIONS, ECHARTS_DONUT_CENTER_TEXT, ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES, ECHARTS_DONUT_TRACK_COLOR } from '@charts/echarts-presets';
import { ProjectState } from '@models/project/project-state.model';
import { NComponent } from '@shards/n/n.component';
import { MlReliabilityDirective } from '@directives/ml-reliability.directive';

interface WorkShare {
    val: number;
    name: string;
    color: string;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-info',
    templateUrl: './project-info.component.html',
    styleUrls: ['./project-info.component.scss'],
    imports: [PermissionsDirective, RouterModule, ChartProgressComponent, NgbTooltipModule, MoneyPipe, EchartsComponent, DecimalPipe, DatePipe, NComponent, MlReliabilityDirective],
})
export class ProjectInfoComponent {
    project = input.required<Project>();

    global = inject(GlobalService);
    inputModalService = inject(InputModalService);

    shouldShowBudgetChart = computed(() => {
        const p = this.project();
        return !p.is_time_based && !p.is_internal && (p.state.progress === ProjectState.ProgressRunning || p.state.progress === ProjectState.ProgressFinished) && p.var?.workshares?.length > 0 && p.worksharesTotal() > 0 && (p.work_estimated ?? 0) > 0;
    });

    budgetChart = computed(() => {
        if (!this.shouldShowBudgetChart()) return { options: null, wrapperStyle: {} };

        const p = this.project();
        const timePercentage = p.timePercentage();
        const dangerColor = Color.fromVar('danger').toHexString();
        const workShares = p.var.workshares || [];

        const baseData = (workShares as WorkShare[]).map((u) => ({
            value: u.val,
            name: u.name,
            itemStyle: { color: u.color, ...ECHARTS_DONUT_ITEM_STYLE },
        }));

        const pieData = timePercentage < 1 ? [...baseData, { value: (p.work_estimated ?? 0) - p.hours_invested, name: 'remaining', itemStyle: { color: ECHARTS_DONUT_TRACK_COLOR, ...ECHARTS_DONUT_ITEM_STYLE } }] : baseData;

        const centerText = `${(timePercentage * 100).toFixed(0)}%`;
        const centerColor = timePercentage >= 1 ? dangerColor : '#ffffff';

        return {
            options: {
                chart: { height: 200 },
                backgroundColor: 'transparent',
                animation: false,
                tooltip: {
                    trigger: 'item',
                    ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
                    formatter: (params: { name: string; value: number }) => `${params.name}: ${params.value.toFixed(1)}h`,
                },
                graphic: [{ type: 'text', left: 'center', top: 'center', style: { ...ECHARTS_DONUT_CENTER_TEXT, text: centerText, fill: centerColor, fontFamily: 'BrunoAce' } }],
                series: [
                    { ...ECHARTS_DONUT_SERIES, data: pieData },
                ],
            },
            wrapperStyle:
                timePercentage >= 1
                    ? {
                          '--budget-over-percentage': `${Math.min(timePercentage - 1, 1) * 360}deg`,
                          '--budget-danger-color': dangerColor,
                      }
                    : {},
        };
    });

    milestoneStates = computed(() => {
        const counts = this.project().milestone_state_counts;
        if (!counts) return [];
        return [
            { ...MILESTONE_STATES[2], count: counts.done },
            { ...MILESTONE_STATES[1], count: counts.in_progress },
            { ...MILESTONE_STATES[0], count: counts.todo },
        ].filter((s) => s.count > 0);
    });

    milestoneTotal = computed(() => this.project().milestone_state_counts?.total || 0);

    getMilestonePerc = (count: number) => (this.milestoneTotal() > 0 ? (100 * count) / this.milestoneTotal() : 0);

    getMilestoneStateTooltip(stateId: number) {
        const counts = this.project().milestone_state_counts;
        if (!counts) return '';
        const countMap: Record<number, number> = { 0: counts.todo, 1: counts.in_progress, 2: counts.done };
        return `${MILESTONE_STATES[stateId]?.name || ''}: ${countMap[stateId] ?? 0}`;
    }

    renameProject = () => {
        const p = this.project();
        this.inputModalService.open($localize`:@@i18n.common.rename:rename`, false, undefined, p.name).then((result) => {
            const name = result?.text?.trim();
            if (!name || name === p.name) return;
            p.name = name;
            p.update().subscribe();
        });
    };

    updateLeadProbability = () => {
        this.inputModalService.open($localize`:@@i18n.project.leadProbability:lead probability`).then((result) => {
            if (result?.text) {
                const newValue = parseFloat(result.text) / 100;
                if (!isNaN(newValue) && newValue >= 0 && newValue <= 1) {
                    const p = this.project();
                    p.lead_probability = newValue;
                    p.update().subscribe();
                }
            }
        });
    };
}
