import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { filter, map } from 'rxjs';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingInitiative } from '@models/marketing/marketing-initiative.model';
import { NxStatic, TBroadcast } from '@app/nx/nx.static';
import { MarketingPerformanceMetric } from '@models/marketing/marketing-performance-metrics.model';
import { MarketingWorkflow } from '@models/marketing/marketing-workflow.model';
import { MarketingActivity } from '@models/marketing/marketing-activity.model';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { LeadSource } from '@models/project/lead-source.model';
import { GlobalService } from '@models/global.service';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@app/_shards/avatar/avatar.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EchartsComponent } from '@charts/echarts-wrapper/echarts-wrapper.component';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { Color } from '@constants/Color';
import { ECHARTS_DONUT_ITEM_STYLE } from '@charts/echarts-presets';
import { ActivityTableComponent } from '@app/marketing/shared/activity-table/activity-table.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import type { EChartsOption } from 'echarts';
import { ActivityStatsMapDto, InitiativeTimelineEntryDto } from '@models/_core/api-response';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';

const ActivityStatsColors = MarketingActivity.STATS_COLORS;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-initiative-detail',
    imports: [DatePipe, FormsModule, Nx, AvatarComponent, NgbTooltipModule, EchartsComponent, HotkeyDirective, ActivityTableComponent, RouterModule, SpinnerComponent],
    templateUrl: './marketing-initiative-detail.component.html',
    styleUrl: './marketing-initiative-detail.component.scss',
})
export class MarketingInitiativeDetailComponent {
    #route = inject(ActivatedRoute);
    #router = inject(Router);
    #marketingService = inject(MarketingService);
    #global = inject(GlobalService);
    #confirm = inject(ConfirmationService);
    #cd = inject(ChangeDetectorRef);

    readonly STATS_COLORS = ActivityStatsColors;

    #initiativeId = toSignal(this.#route.params.pipe(map((params) => params['id'] as string | undefined)));
    #initiative = modelResource(this.#initiativeId, (id) => this.#marketingService.showInitiative(id));
    #stats = modelResource(this.#initiativeId, (id) => this.#marketingService.showInitiativeStats(id));

    initiative = linkedSignal(() => this.#initiative.value());
    isLoading = this.#initiative.isLoading;
    chartOptions = computed(() => this.#charts()?.line ?? null);
    donutChartOptions = computed(() => this.#charts()?.donut ?? null);

    readonly isSubscribed = computed(() => this.initiative()?.users?.some((u) => u.id === this.#global.user?.id) ?? false);

    showChannelModal = signal(false);
    selectedChannelId: string = '';
    isPrimaryChannel = signal(false);
    availableLeadSources: LeadSource[] = [];

    showWorkflowModal = signal(false);
    availableWorkflows = modelListResource(() => this.#marketingService.indexWorkflows()).value;
    selectedWorkflowId: string = '';

    showMetricModal = signal(false);
    availableMetrics = modelListResource(() => this.#marketingService.indexMetrics()).value;
    selectedMetricId: string = '';
    metricTargetValue?: number;


    constructor() {
        this.availableLeadSources = this.#global.lead_sources();

        this.#marketingService.initiativeActivitySaved$
            .pipe(takeUntilDestroyed())
            .subscribe((initiativeId) => {
                if (String(this.#initiativeId()) === initiativeId) this.loadInitiative();
            });

        NxStatic.broadcast$
            .pipe(
                takeUntilDestroyed(),
                filter((e) => e.type === TBroadcast.Update && e.data instanceof MarketingInitiative),
            )
            .subscribe(({ data }) => {
                const current = this.initiative();
                if (!current || current === data || String(current.id) !== String(data.id)) return;
                const { name, description, status, start_date, end_date } = data as MarketingInitiative;
                this.initiative.set(Object.assign(Object.create(Object.getPrototypeOf(current)), current, { name, description, status, start_date, end_date }));
            });

        effect(() => {
            const first = this.initiative()?.initiative_activities?.[0];
            if (first && !this.#route.firstChild) this.#router.navigate(['activity', first.id], { relativeTo: this.#route });
        });

        effect(() => {
            const stats = this.#stats.value();
            const loaded = this.#initiative.value();
            const actStats = stats?.activities ?? stats?.activity_stats ?? stats?.initiative_activities ?? stats?.per_activity;
            if (actStats && loaded?.initiative_activities) untracked(() => this.#applyActivityStats(actStats));
        });
    }

    loadInitiative() {
        this.#initiative.reload();
        this.#stats.reload();
    }

    readonly #charts = computed(() => {
        const timeline = this.#stats.value()?.timeline;
        return timeline?.length ? this.#buildCharts(timeline) : null;
    });

    #buildCharts(timeline: InitiativeTimelineEntryDto[]): { line: EChartsOption; donut: EChartsOption } {
        const primaryColor = Color.fromVar('primary').toHexString();
        const totalData = timeline.map((t) => [t.timestamp, (t.new || 0) + (t.engaged || 0) + (t.unresponsive || 0) + (t.converted || 0)]);

        const line: EChartsOption = {
            chart: { height: 90 },
            backgroundColor: 'transparent',
            animation: false,
            grid: { left: 5, right: 5, top: 0, bottom: 0 },
            xAxis: { type: 'time', show: false },
            yAxis: { type: 'value', show: false, min: 0 },
            tooltip: { trigger: 'axis', formatter: (rawParams: unknown) => {
                const params = rawParams as { value: [number, number] }[];
                return new Date(params[0]?.value[0]).toLocaleDateString() + ': ' + params[0]?.value[1];
            } },
            series: [
                {
                    name: 'Prospects',
                    type: 'line',
                    symbol: 'none',
                    smooth: true,
                    data: totalData,
                    lineStyle: { width: 2, color: primaryColor },
                    itemStyle: { color: primaryColor },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                                { offset: 0, color: primaryColor + '40' },
                                { offset: 1, color: primaryColor + '00' },
                            ],
                        },
                    },
                },
            ],
        };

        const latest = timeline[timeline.length - 1];
        const totalNew = latest.new || 0;
        const totalEngaged = latest.engaged || 0;
        const totalUnresponsive = latest.unresponsive || 0;
        const totalConverted = latest.converted || 0;
        const total = totalNew + totalEngaged + totalUnresponsive + totalConverted;

        const donut: EChartsOption = {
            chart: { height: 100, width: 100 },
            backgroundColor: 'transparent',
            animation: false,
            tooltip: { trigger: 'item', formatter: (rawParams: unknown) => {
                const p = rawParams as { name: string; value: number };
                return `${p.name}: ${p.value} (${total > 0 ? ((p.value / total) * 100).toFixed(1) : 0}%)`;
            } },
            series: [
                {
                    type: 'pie',
                    radius: ['62%', '76%'],
                    data: [
                        { value: totalNew, name: 'New', itemStyle: { color: Color.fromVar('info').toHexString(), ...ECHARTS_DONUT_ITEM_STYLE } },
                        { value: totalEngaged, name: 'Engaged', itemStyle: { color: Color.fromVar('warning').toHexString(), ...ECHARTS_DONUT_ITEM_STYLE } },
                        { value: totalUnresponsive, name: 'Unresponsive', itemStyle: { color: Color.fromVar('danger').toHexString(), ...ECHARTS_DONUT_ITEM_STYLE } },
                        { value: totalConverted, name: 'Converted', itemStyle: { color: Color.fromVar('success').toHexString(), ...ECHARTS_DONUT_ITEM_STYLE } },
                    ],
                    label: { show: false },
                },
            ],
        };

        return { line, donut };
    }

    #applyActivityStats(activityStats: ActivityStatsMapDto) {
        const initiative = this.initiative()!;
        for (const activity of initiative.initiative_activities!) {
            const s = Array.isArray(activityStats) ? activityStats.find((a) => String(a.id) === String(activity.id)) : activityStats[activity.id];
            if (s) activity.stats = s;
        }
        initiative.initiative_activities = [...initiative.initiative_activities!];
        this.initiative.update((current) => Object.assign(Object.create(Object.getPrototypeOf(current)), current));
        this.#cd.markForCheck();
    }

    subscribe() {
        const initiative = this.initiative();
        if (!initiative || !this.#global.user) return;

        this.#marketingService.subscribeToInitiative(initiative.id, this.#global.user.id).subscribe(() => {
            if (this.initiative()) {
                this.loadInitiative();
            }
            this.#marketingService.initiativeSubscriptionChanged$.next();
        });
    }

    async unsubscribe() {
        const initiative = this.initiative();
        if (!initiative || !this.#global.user) return;
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.marketing.unsubscribe:unsubscribe`, message: $localize`:@@i18n.marketing.confirmUnsubscribe:unsubscribe from this initiative?` }))) return;

        this.#marketingService.unsubscribeFromInitiative(initiative.id, this.#global.user.id.toString()).subscribe(() => {
            if (this.initiative()) {
                this.loadInitiative();
            }
            this.#marketingService.initiativeSubscriptionChanged$.next();
        });
    }

    getStatusBadgeClass(status: string): string {
        switch (status) {
            case 'active':
                return 'bg-success';
            case 'paused':
                return 'bg-warning';
            case 'completed':
                return 'bg-dark';
            default:
                return 'bg-secondary';
        }
    }

    async removeChannel(channelId: number) {
        const initiative = this.initiative();
        if (!initiative) return;
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.remove:remove`, message: $localize`:@@i18n.marketing.confirmRemoveChannel:remove this channel from the initiative?` }))) return;

        this.#marketingService.removeInitiativeChannel(initiative.id, channelId).subscribe(() => {
            if (this.initiative()) {
                this.loadInitiative();
            }
        });
    }

    openWorkflowEditor(workflowId: string) {
        this.#router.navigate(['/marketing/workflows'], {
            queryParams: { workflowId },
        });
    }

    assignChannel() {
        const initiative = this.initiative();
        if (!initiative || !this.selectedChannelId) return;

        this.#marketingService.assignInitiativeChannel(initiative.id, parseInt(this.selectedChannelId), this.isPrimaryChannel()).subscribe(() => {
            if (this.initiative()) {
                this.loadInitiative();
            }
            this.resetChannelForm();
        });
    }

    resetChannelForm() {
        this.selectedChannelId = '';
        this.isPrimaryChannel.set(false);
        this.showChannelModal.set(false);
    }

    attachWorkflow() {
        const initiative = this.initiative();
        if (!initiative || !this.selectedWorkflowId) return;

        this.#marketingService
            .attachWorkflowToInitiative(initiative.id, {
                marketing_workflow_id: this.selectedWorkflowId,
                is_active: true,
            })
            // TODO(types): endpoint returns the initiative's full workflow list, but the service
            // method is typed via `post(..., MarketingWorkflow)` (single item) since it deserializes
            // per-item either way; cast once here rather than changing the shared post() overloads.
            .subscribe((workflows) => {
                this.initiative.update((current) => {
                    if (!current) return current;
                    current.workflows = workflows as unknown as MarketingWorkflow[];
                    return Object.assign(Object.create(Object.getPrototypeOf(current)), current);
                });
                this.resetWorkflowForm();
            });
    }

    resetWorkflowForm() {
        this.selectedWorkflowId = '';
        this.showWorkflowModal.set(false);
    }

    attachMetric() {
        const initiative = this.initiative();
        if (!initiative || !this.selectedMetricId) return;

        this.#marketingService
            .attachMetricToInitiative(initiative.id, {
                metric_id: this.selectedMetricId,
                target_value: this.metricTargetValue,
            })
            .pipe(map(() => this.availableMetrics().find((m) => m.id === this.selectedMetricId)!))
            .subscribe((metric: MarketingPerformanceMetric) => {
                if (metric) {
                    metric.pivot = {
                        target_value: this.metricTargetValue,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };
                    this.initiative.update((current) => {
                        if (!current) return current;
                        current.performance_metrics = [...(current.performance_metrics || []), metric];
                        return Object.assign(Object.create(Object.getPrototypeOf(current)), current);
                    });
                }
                this.resetMetricForm();
            });
    }

    resetMetricForm() {
        this.selectedMetricId = '';
        this.metricTargetValue = undefined;
        this.showMetricModal.set(false);
    }

}
