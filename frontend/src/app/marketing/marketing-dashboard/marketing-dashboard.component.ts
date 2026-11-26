import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MarketingService } from '@models/marketing/marketing.service';
import { MarketingInitiative } from '@models/marketing/marketing-initiative.model';
import { modelResource } from '@models/http/model-resource';
import { dayjs, Dayjs } from '@constants/date/dates';
import { NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { FormsModule } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { SankeyChartComponent } from '@charts/sankey-chart/sankey-chart.component';
import { ChartProgressComponent } from '@charts/chart-progress/chart-progress.component';

import { GlobalService } from '@models/global.service';
import { LeadSource } from '@models/project/lead-source.model';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { ProspectStatsDto } from '@models/_core/api-response';
import { storageGet, storageSet } from '@constants/storage';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-dashboard',
    templateUrl: './marketing-dashboard.component.html',
    styleUrls: ['./marketing-dashboard.component.scss'],
    imports: [NgxDaterangepickerMd, FormsModule, NgbTooltipModule, SankeyChartComponent, ChartProgressComponent, SpinnerComponent],
})
export class MarketingDashboardComponent {
    funnelMode: 'count' | 'money' = 'count';
    creation_span?: { startDate: Dayjs; endDate: Dayjs };

    presetRanges = {
        'Last 12 Months': [dayjs().subtract(12, 'months').startOf('month'), dayjs().endOf('month')],
        'Last 36 Months': [dayjs().subtract(36, 'months').startOf('month'), dayjs().endOf('month')],
        'Last Year': [dayjs().subtract(1, 'year').startOf('year'), dayjs().subtract(1, 'year').endOf('year')],
        'This Year': [dayjs().startOf('year'), dayjs().endOf('year')],
        'Last 3 Years': [dayjs().subtract(3, 'years').startOf('year'), dayjs().endOf('year')],
        'Last 5 Years': [dayjs().subtract(5, 'years').startOf('year'), dayjs().endOf('year')],
    } satisfies Record<string, [Dayjs, Dayjs]>;
    service = inject(MarketingService);
    router = inject(Router);
    #global = inject(GlobalService);
    #input = inject(InputModalService);

    #funnelFilters = signal<Dictionary>({});
    #funnel = modelResource(this.#funnelFilters, (filters) => this.service.getFunnel(filters));
    funnelData = this.#funnel.value;
    loadingFunnel = this.#funnel.isLoading;

    #initiatives = modelResource(() => this.service.indexInitiatives());
    #prospectStats = modelResource(() => this.service.showProspectStats());
    #dashboard = modelResource(() => this.service.getDashboardStats());
    #remarketing = modelResource(() => this.service.getRemarketing());

    dashboardStats = this.#dashboard.value;
    loadingDashboard = this.#dashboard.isLoading;
    remarketing = this.#remarketing.value;
    loadingRemarketing = this.#remarketing.isLoading;

    stats = computed(() => {
        const initiatives = this.#initiatives.value()?.data ?? [];
        const p: ProspectStatsDto = this.#prospectStats.value() ?? {};
        return {
            initiatives: {
                total: initiatives.length,
                active: MarketingInitiative.countByStatus(initiatives).active,
            },
            prospects: {
                total: p.total || 0,
                new: p.by_status?.new || 0,
                engaged: p.by_status?.engaged || 0,
                converted: p.by_status?.converted || 0,
                unresponsive: p.by_status?.unresponsive || 0,
                disqualified: p.by_status?.disqualified || 0,
                on_hold: p.by_status?.on_hold || 0,
            },
            activities: {
                pending: p.activities_pending || 0,
                overdue: p.activities_overdue || 0,
            },
        };
    });

    activitySchedule = computed(() => {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const heatmap = this.dashboardStats()?.heatmap ?? [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(today);
            d.setDate(d.getDate() + i);
            const date = d.toISOString().split('T')[0];
            const entry = heatmap.find((h) => h.date === date);
            return {
                day: i === 0 ? 'Today' : dayNames[d.getDay()],
                date,
                total: entry?.total || 0,
                completed: entry?.completed || 0,
                pending: entry?.pending || 0,
                isToday: i === 0,
            };
        });
    });

    toggleFunnelMode() {
        this.funnelMode = this.funnelMode === 'count' ? 'money' : 'count';
    }

    clearSelection = () => {
        this.creation_span = undefined;
        this.onCreationUpdated();
    };

    onCreationUpdated = () => {
        const span = this.creation_span;
        this.#funnelFilters.set(
            span?.startDate && span?.endDate
                ? { created_after: span.startDate.format('DD.MM.YYYY'), created_before: span.endDate.add(1, 'day').format('DD.MM.YYYY') }
                : {},
        );
    };

    agingBars = computed(() => {
        const aging = this.dashboardStats()?.aging;
        if (!aging) return [];
        const { fresh = 0, warm = 0, cooling = 0, stale = 0 } = aging;
        const max = Math.max(fresh, warm, cooling, stale) || 1;
        return [
            { label: 'fresh', value: fresh, h: Math.round((fresh / max) * 52) },
            { label: 'warm', value: warm, h: Math.round((warm / max) * 52) },
            { label: 'cooling', value: cooling, h: Math.round((cooling / max) * 52) },
            { label: 'stale', value: stale, h: Math.round((stale / max) * 52) },
        ];
    });

    conversionRate = computed<number>(() => {
        const total = this.stats().prospects.total;
        if (!total) return 0;
        return Math.round((this.stats().prospects.converted / total) * 100);
    });

    onNewLeadSource() {
        this.#input.open('Please enter the name of the new source').then((response) => {
            if (response) {
                LeadSource.fromJson({}).store({ name: response.text }).subscribe((created) => this.#global.lead_sources.update((sources) => [...sources, created]));
            }
        });
    }

    navigateToSection(route: string) {
        this.router.navigate(['/marketing', route]);
    }
    navigateToInitiative(id: number) {
        this.router.navigate(['/marketing/initiatives', id]);
    }
    navigateToWorkflow(id: number) {
        this.router.navigate(['/marketing/workflows', id]);
    }
    navigateToRemarketing() {
        this.router.navigate(['/marketing/remarketing']);
    }
    navigateToMemberProspects(userId: number) {
        const existing = storageGet<Dictionary<unknown>>('marketing-prospects-filters', {});
        storageSet('marketing-prospects-filters', { ...existing, userFilter: String(userId) });
        this.router.navigate(['/marketing/prospects']);
    }

}
