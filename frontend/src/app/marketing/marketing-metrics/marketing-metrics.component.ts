import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, linkedSignal, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { MarketingService } from '@models/marketing/marketing.service';
import { modelListResource } from '@models/http/model-resource';
import { MarketingPerformanceMetric } from '@models/marketing/marketing-performance-metrics.model';
import { MarketingActivity } from '@models/marketing/marketing-activity.model';
import { Nx, ActionEmitterType } from '@app/nx/nx.directive';
import { NxActionType } from '@models/_core/nx.actions';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { GuidedTourComponent } from '@shards/guided-tour/guided-tour.component';
import { ColorPickerDirective } from 'ngx-color-picker';
import { StackedTableDirective } from '@directives/stacked-table.directive';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

const ActivityStatsColors = MarketingActivity.STATS_COLORS;

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'marketing-metrics',
    templateUrl: './marketing-metrics.component.html',
    styleUrls: ['./marketing-metrics.component.scss'],
    imports: [StackedTableDirective, FormsModule, Nx, NgbTooltipModule, NgbDropdownModule, EmptyStateComponent, GuidedTourComponent, ColorPickerDirective, SpinnerComponent],
})
export class MarketingMetricsComponent {
    #marketingService = inject(MarketingService);
    #cdr = inject(ChangeDetectorRef);
    #confirm = inject(ConfirmationService);

    #loaded = modelListResource(() => this.#marketingService.indexMetrics());
    metrics = linkedSignal(() => this.#loaded.value());
    metricsLoaded = this.#loaded.hasValue;
    selectedMetric: MarketingPerformanceMetric | null = null;

    readonly STATS_COLORS = ActivityStatsColors;

    typeFilter = signal('');
    filteredMetrics = computed(() => this.metrics().filter((metric) => !this.typeFilter() || metric.metric_type === this.typeFilter()));

    showMetricModal = signal(false);
    hoveredRelatedMetricId = signal<string | undefined>(undefined);
    editingMetric = signal<MarketingPerformanceMetric | null>(null);
    metricForm = {
        name: '',
        description: undefined as string | undefined,
        metric_type: 'counter' as MarketingPerformanceMetric['metric_type'],
        target_value: undefined as number | undefined,
        kpi_icon: '',
        kpi_color: '',
        related_metric_id: undefined as string | undefined,
    };

    iconSearch = signal('');
    relatedMetricSearch = signal('');

    readonly editNxContext = { openEdit: (m: MarketingPerformanceMetric) => this.openEditModal(m) };

    stats = computed(() => {
        const metrics = this.metrics();
        const countOf = (type: MarketingPerformanceMetric['metric_type']) => metrics.filter((m) => m.metric_type === type).length;
        return {
            total: metrics.length,
            byType: { counter: countOf('counter'), percentage: countOf('percentage'), conversion: countOf('conversion'), currency: countOf('currency'), duration: countOf('duration') },
        };
    });

    metricTypes = [
        { value: 'counter', label: $localize`:@@i18n.marketing.counter:Counter`, icon: 'tag', description: $localize`:@@i18n.marketing.counterDesc:Simple count (e.g., emails sent)` },
        { value: 'percentage', label: $localize`:@@i18n.marketing.percentage:Percentage`, icon: 'percent', description: $localize`:@@i18n.marketing.percentageDesc:Value as percentage (e.g., open rate)` },
        { value: 'conversion', label: $localize`:@@i18n.marketing.conversion:Conversion`, icon: 'trending_up', description: $localize`:@@i18n.marketing.conversionDesc:Conversion rate (e.g., click-through rate)` },
        { value: 'currency', label: $localize`:@@i18n.marketing.currency:Currency`, icon: 'attach_money', description: $localize`:@@i18n.marketing.currencyDesc:Monetary value (e.g., revenue)` },
        { value: 'duration', label: $localize`:@@i18n.marketing.duration:Duration`, icon: 'schedule', description: $localize`:@@i18n.marketing.durationDesc:Time duration (e.g., response time)` },
    ];

    readonly MATERIAL_ICONS = [
        'analytics', 'bar_chart', 'pie_chart', 'show_chart', 'trending_up', 'trending_down', 'leaderboard', 'insights', 'query_stats', 'monitoring',
        'campaign', 'ads_click', 'local_offer', 'sell', 'storefront', 'shopping_cart', 'loyalty', 'redeem', 'volunteer_activism', 'workspace_premium',
        'email', 'phone', 'message', 'chat', 'forum', 'send', 'notifications', 'inbox', 'mark_email_read', 'contact_mail',
        'attach_money', 'payments', 'account_balance', 'savings', 'euro', 'currency_exchange', 'price_check', 'credit_card', 'receipt', 'request_quote',
        'schedule', 'timer', 'alarm', 'access_time', 'hourglass_empty', 'calendar_today', 'event', 'date_range', 'update', 'history',
        'person', 'group', 'people', 'person_add', 'supervisor_account', 'groups', 'account_circle', 'badge', 'handshake', 'record_voice_over',
        'flag', 'emoji_events', 'star', 'grade', 'verified', 'check_circle', 'task_alt', 'done_all', 'military_tech', 'celebration',
        'article', 'description', 'note', 'assignment', 'list', 'checklist', 'text_snippet', 'edit_note', 'bookmark', 'push_pin',
        'tag', 'percent', 'numbers', 'functions', 'calculate', 'speed', 'bolt', 'flash_on', 'moving', 'stacked_line_chart',
        'favorite', 'thumb_up', 'visibility', 'share', 'link', 'search', 'tune', 'settings', 'build', 'category',
        'label', 'location_on', 'public', 'language', 'translate', 'cloud', 'rocket_launch', 'auto_awesome', 'hub', 'network_check',
    ];

    readonly filteredIcons = computed<string[]>(() => {
        const search = this.iconSearch();
        return search
            ? this.MATERIAL_ICONS.filter((i) => i.includes(search.toLowerCase()))
            : this.MATERIAL_ICONS;
    });

    readonly relatedMetricOptions = computed<MarketingPerformanceMetric[]>(() => {
        const editingId = this.editingMetric()?.id;
        const search = this.relatedMetricSearch().toLowerCase();
        return this.metrics().filter((m) =>
            m.metric_type !== 'percentage' && m.id !== editingId
        ).filter((m) =>
            !search || m.name.toLowerCase().includes(search)
        );
    });

    getRelatedMetric(): MarketingPerformanceMetric | undefined {
        return this.metrics().find((m) => m.id === this.metricForm.related_metric_id);
    }

    getMetricById(id: string | undefined): MarketingPerformanceMetric | undefined {
        if (!id) return undefined;
        return this.metrics().find((m) => m.id === id);
    }

    filterByType(type: string) {
        this.typeFilter.set(type);
    }

    selectMetric(metric: MarketingPerformanceMetric) {
        this.selectedMetric = metric;
    }

    openCreateModal() {
        this.editingMetric.set(null);
        this.metricForm = { name: '', description: undefined, metric_type: 'counter', target_value: undefined, kpi_icon: '', kpi_color: '', related_metric_id: undefined };
        this.iconSearch.set('');
        this.relatedMetricSearch.set('');
        this.showMetricModal.set(true);
    }

    openEditModal(metric: MarketingPerformanceMetric) {
        this.editingMetric.set(metric);
        this.metricForm = {
            name: metric.name,
            description: metric.description,
            metric_type: metric.metric_type,
            target_value: metric.target_value,
            kpi_icon: metric.kpi_icon ?? '',
            kpi_color: metric.kpi_color ?? '',
            related_metric_id: metric.related_metric_id,
        };
        this.iconSearch.set('');
        this.relatedMetricSearch.set('');
        this.showMetricModal.set(true);
        this.#cdr.markForCheck();
    }

    saveMetric() {
        if (!this.metricForm.name || !this.metricForm.metric_type) return;

        const metricData = {
            name: this.metricForm.name,
            description: this.metricForm.description,
            metric_type: this.metricForm.metric_type,
            target_value: this.metricForm.target_value,
            kpi_icon: this.metricForm.kpi_icon || null,
            kpi_color: this.metricForm.kpi_color || null,
            related_metric_id: this.metricForm.metric_type === 'percentage' ? (this.metricForm.related_metric_id ?? null) : null,
        };

        const editingMetric = this.editingMetric();
        if (editingMetric) {
            this.#marketingService.updateMetric(editingMetric.id!, metricData).subscribe((updated: MarketingPerformanceMetric) => {
                this.metrics.update((metrics) => metrics.map((m) => (m.id === updated.id ? updated : m)));
                if (this.selectedMetric?.id === updated.id) this.selectedMetric = updated;
                this.resetForm();
                this.#cdr.markForCheck();
            });
        } else {
            this.#marketingService.storeMetric(metricData).subscribe((metric: MarketingPerformanceMetric) => {
                this.metrics.update((metrics) => [...metrics, metric]);
                this.resetForm();
                this.#cdr.markForCheck();
            });
        }
    }

    async deleteMetric(metric: MarketingPerformanceMetric) {
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.delete:delete`, message: $localize`:@@i18n.marketing.confirmDeleteMetric:delete metric "${metric.name}"? This will remove it from all initiatives and activities.` }))) return;

        this.#marketingService.destroyMetric(metric.id!).subscribe(() => {
            this.metrics.update((metrics) => metrics.filter((m) => m.id !== metric.id));
            if (this.selectedMetric?.id === metric.id) this.selectedMetric = null;
            this.#cdr.markForCheck();
        });
    }

    onActionResolved(event: ActionEmitterType) {
        const actionType = typeof event.action.type === 'function' ? event.action.type() : event.action.type;
        if (actionType === NxActionType.Destructive) {
            const deleted = event.object.nx() as MarketingPerformanceMetric;
            this.metrics.update((metrics) => metrics.filter((m) => m.id !== deleted.id));
        }
        this.#cdr.markForCheck();
    }

    resetForm() {
        this.metricForm = { name: '', description: undefined, metric_type: 'counter', target_value: undefined, kpi_icon: '', kpi_color: '', related_metric_id: undefined };
        this.iconSearch.set('');
        this.relatedMetricSearch.set('');
        this.editingMetric.set(null);
        this.showMetricModal.set(false);
    }

    getMetricTypeInfo(type: string) {
        return this.metricTypes.find((t) => t.value === type);
    }

    getCompletedTooltip(count: number): string {
        return $localize`:@@i18n.marketing.completed_count:completed: ${count}`;
    }

    getOverdueTooltip(count: number): string {
        return $localize`:@@i18n.marketing.overdue_count:overdue: ${count}`;
    }

    getPendingTooltip(count: number): string {
        return $localize`:@@i18n.marketing.pending_count:pending: ${count}`;
    }

    getSkippedTooltip(count: number): string {
        return $localize`:@@i18n.marketing.skipped_count:skipped: ${count}`;
    }
}
