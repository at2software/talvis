import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { IActivityBase } from '@models/marketing/activity-base.interface';
import { MarketingPerformanceMetric } from '@models/marketing/marketing-performance-metrics.model';
import { MarketingActivity } from '@models/marketing/marketing-activity.model';
import { StackedTableDirective } from '@directives/stacked-table.directive';

@Component({
    selector: 'activity-table',
    imports: [StackedTableDirective, NgbTooltipModule, RouterLink, RouterLinkActive],
    templateUrl: './activity-table.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityTableComponent {
    activities = input<IActivityBase[]>([]);
    allMetrics = input<MarketingPerformanceMetric[]>([]);
    prospectsCount = input(0);
    activityRoute = input<(string | number)[] | null>(null);
    activityClicked = output<IActivityBase>();
    progressBar = input(true);

    readonly STATS_COLORS = MarketingActivity.STATS_COLORS;

    hoveredActivityId: string | null = null;

    sortedActivities = computed(() => [...this.activities()].sort((a, b) => (a.day_offset || 0) - (b.day_offset || 0)));

    #activityMap = computed(() => new Map(this.activities().map((a) => [a.id, a])));

    #missingRelatedMetricWarnings = computed(() => {
        const sorted = this.sortedActivities();
        const warnings = new Map<string, string>();

        for (let i = 0; i < sorted.length; i++) {
            const metrics = this.getPerformanceMetrics(sorted[i]);
            for (const metric of metrics) {
                if (metric.metric_type !== 'percentage' || !metric.related_metric_id) continue;
                const preceedingHasRelated = sorted
                    .slice(0, i)
                    .some((prev) => this.getPerformanceMetrics(prev).some((m) => m.id === metric.related_metric_id));
                if (!preceedingHasRelated) {
                    const relatedName = this.#findMetricName(metric.related_metric_id);
                    warnings.set(sorted[i].id, $localize`:@@i18n.marketing.missing_related_metric:no preceding activity found for related metric: "${relatedName}"`);
                }
            }
        }
        return warnings;
    });

    #findMetricName(id: string): string {
        const fromAll = this.allMetrics().find((m) => m.id === id);
        if (fromAll) return fromAll.name;
        for (const activity of this.activities()) {
            const found = this.getPerformanceMetrics(activity).find((m) => m.id === id);
            if (found) return found.name;
        }
        return id;
    }

    getMetricWarning(activity: IActivityBase): string | null {
        return this.#missingRelatedMetricWarnings().get(activity.id) ?? null;
    }

    getParentActivityName(parentId: string): string {
        const parent = this.#activityMap().get(parentId);
        return parent ? `Day ${parent.day_offset}: ${parent.name}` : '';
    }

    getParentActivityDay(parentId: string): number | string {
        const parent = this.#activityMap().get(parentId);
        return parent ? parent.day_offset : '';
    }

    getMetricsTooltip(metrics?: MarketingPerformanceMetric[]): string {
        if (!metrics || metrics.length === 0) return '';
        return metrics.map((m) => m.name).join(', ');
    }

    formatQuickAction = MarketingActivity.quickActionLabel;
    getQuickActionIcon = MarketingActivity.quickActionIcon;

    onActivityClick(activity: IActivityBase) {
        this.activityClicked.emit(activity);
    }

    hasPerformanceMetrics(activity: IActivityBase): boolean {
        return 'performance_metrics' in activity && Array.isArray(activity.performance_metrics) && activity.performance_metrics.length > 0;
    }

    getFirstMetric(activity: IActivityBase): MarketingPerformanceMetric | null {
        if (!this.hasPerformanceMetrics(activity)) return null;
        return activity.performance_metrics![0];
    }

    getPerformanceMetrics(activity: IActivityBase): MarketingPerformanceMetric[] {
        if (!this.hasPerformanceMetrics(activity)) return [];
        return activity.performance_metrics || [];
    }
}
