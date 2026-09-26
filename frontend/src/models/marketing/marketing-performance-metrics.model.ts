import { Serializable } from '@models/_core/serializable';
import { NxAction, NxActionType } from '@models/_core/nx.actions';
import type { ActivityStatsDto } from '@models/_core/api-response';
import { Model } from '@constants/model/type-discriminators';
import { firstValueFrom } from 'rxjs';

export type TPivot<K1 extends string, K2 extends string> = {
    created_at?: string;
    updated_at?: string;
} & Partial<Record<`${K1}_id` | `${K2}_id`, string>>;

@Model('MarketingPerformanceMetric')
export class MarketingPerformanceMetric extends Serializable {
    static API_PATH = (): string => 'marketing_performance_metrics';

    name!: string;
    description?: string;
    metric_type!: 'counter' | 'percentage' | 'conversion' | 'currency' | 'duration';
    target_value?: number;
    current_value?: number;
    progress_percentage?: number;
    activity_stats?: ActivityStatsDto;
    pivot?: TPivot<'marketing_initiative', 'marketing_performance_metric'> & { target_value?: number };
    kpi_icon?: string;
    kpi_color?: string;
    related_metric_id?: string;


    protected override buildActions(): NxAction[] {
        return [
            {
                title: $localize`:@@i18n.common.edit:edit`,
                doubleClick: true,
                action: (_: any, nxContext: any) => { nxContext?.openEdit?.(this); },
                roles: 'marketing',
            },
            {
                title: $localize`:@@i18n.marketing.unlink_from_initiative:unlink from initiative`,
                group: true,
                type: NxActionType.Destructive,
                context: 'initiative_details',
                action: () => this.httpService.delete(`marketing/initiatives/${this.pivot?.marketing_initiative_id}/metrics/${this.id}`),
                roles: 'marketing',
            },
            {
                title: $localize`:@@i18n.common.delete:delete`,
                group: true,
                type: NxActionType.Destructive,
                context: '!initiative_details',
                action: () => this.modalConfirm().then(() => firstValueFrom(this.httpService.delete(`marketing/metrics/${this.id}`)).then(() => this)),
                hotkey: 'DEL',
                roles: 'marketing',
            },
        ];
    }

    getIcon(): string {
        if (this.kpi_icon) return this.kpi_icon;
        switch (this.metric_type) {
            case 'counter': return 'tag';
            case 'percentage': return 'percent';
            case 'conversion': return 'trending_up';
            case 'currency': return 'attach_money';
            case 'duration': return 'schedule';
            default: return 'analytics';
        }
    }

    getIconColor(): string {
        if (this.kpi_color) return this.kpi_color;
        switch (this.metric_type) {
            case 'counter': return '#6366f1';
            case 'percentage': return '#10b981';
            case 'conversion': return '#f59e0b';
            case 'currency': return '#06b6d4';
            case 'duration': return '#8b5cf6';
            default: return '#6b7280';
        }
    }

    formatValue(): string {
        const stats = this.activity_stats;
        if (!stats) return '';
        switch (this.metric_type) {
            case 'percentage':
                return `${(this.current_value ?? (stats.completed / stats.total) * 100).toFixed(1)}%`;
            case 'conversion':
                return `${((stats.completed / stats.total) * 100).toFixed(1)}%`;
            case 'currency':
                return `$${stats.completed.toLocaleString()}`;
            case 'duration':
                return `${stats.completed}h`;
            default:
                return (this.current_value ?? stats.completed).toString();
        }
    }

    formatTargetValue(): string {
        const value = this.target_value ?? 0;
        switch (this.metric_type) {
            case 'percentage':
            case 'conversion':
                return `${value}%`;
            case 'currency':
                return `$${value.toLocaleString()}`;
            case 'duration':
                return `${value}h`;
            default:
                return value.toString();
        }
    }
}
