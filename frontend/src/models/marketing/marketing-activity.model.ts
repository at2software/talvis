import { Serializable } from '@models/_core/serializable';
import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Type } from '@models/_core/hydrate';
import { MarketingPerformanceMetric } from './marketing-performance-metrics.model';
import { IActivityBase } from './activity-base.interface';
import { Model } from '@constants/model/type-discriminators';
import type { ActivityStatsDto } from '@models/_core/api-response';

export type QuickActionType = 'EMAIL' | 'LINKEDIN' | 'LINKEDIN_SEARCH' | 'CALL' | null;

@Model('MarketingActivity')
export class MarketingActivity extends Serializable implements IActivityBase {
    static API_PATH = (): string => 'marketing_activities';
    static STATS_COLORS = {
        completed: 'bg-success',
        overdue: 'bg-danger',
        pending: 'bg-dark-grey',
        skipped: 'bg-purple',
    };
    static QUICK_ACTIONS: NonNullable<QuickActionType>[] = ['EMAIL', 'LINKEDIN', 'LINKEDIN_SEARCH', 'CALL'];
    static #QUICK_ACTION_ICONS: Record<string, string> = { EMAIL: 'email', LINKEDIN: 'open_in_new', LINKEDIN_SEARCH: 'search', CALL: 'phone' };
    static #QUICK_ACTION_LABELS: Record<string, string> = { EMAIL: 'Email', LINKEDIN: 'LinkedIn', LINKEDIN_SEARCH: 'LinkedIn Search', CALL: 'Phone Call' };
    static quickActionIcon = (qa: string): string => MarketingActivity.#QUICK_ACTION_ICONS[qa] || '';
    static quickActionLabel = (qa: string): string => MarketingActivity.#QUICK_ACTION_LABELS[qa] || qa.replace(/_/g, ' ');

    marketing_workflow_id!: string;
    name!: string;
    day_offset!: number;
    description!: string | { language: string; formality: string; text: string }[];
    is_required!: boolean;
    has_external_dependency!: boolean;
    parent_activity_id?: string;
    quick_action?: QuickActionType;
    is_shared?: boolean;

    stats?: ActivityStatsDto;

    @Type(()=>MarketingPerformanceMetric) performance_metrics?: MarketingPerformanceMetric[];
    @Type(()=>MarketingActivity) child_activities?: MarketingActivity[];
    @Type(()=>MarketingActivity) parent_activity?: MarketingActivity;

    protected override buildActions(): NxAction[] {
        return [
            {
                title: $localize`:@@i18n.common.edit:edit`,
                doubleClick: true,
                action: (_success?: (v: unknown) => void, nxContext?: unknown) => {
                    const context = nxContext as { component?: { openEditActivityModal(_: MarketingActivity): void } } | undefined;
                    context?.component?.openEditActivityModal(this);
                },
            },
            {
                title: $localize`:@@i18n.marketing.mark_as_required:mark as required`,
                on: () => !this.is_required,
                action: () => {
                    this.update({ is_required: true }).subscribe();
                },
            },
            {
                title: $localize`:@@i18n.marketing.mark_as_optional:mark as optional`,
                on: () => this.is_required,
                action: () => {
                    this.update({ is_required: false }).subscribe();
                },
            },
            {
                title: $localize`:@@i18n.marketing.add_external_dependency:add external dependency`,
                on: () => !this.has_external_dependency,
                action: () => {
                    this.update({ has_external_dependency: true }).subscribe();
                },
            },
            {
                title: $localize`:@@i18n.marketing.remove_external_dependency:remove external dependency`,
                on: () => this.has_external_dependency,
                action: () => {
                    this.update({ has_external_dependency: false }).subscribe();
                },
            },
            {
                title: $localize`:@@i18n.common.delete:delete`,
                group: true,
                type: NxActionType.Destructive,
                action: () =>
                    this.modalConfirm().then(() => {
                        this.delete().subscribe();
                    }),
                roles: 'marketing',
            },
        ];
    }
}
