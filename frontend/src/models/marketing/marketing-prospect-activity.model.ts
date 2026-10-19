import { Serializable } from '@models/_core/serializable';
import { Type } from '@models/_core/hydrate';
import { tap } from 'rxjs';
import { MarketingProspect } from './marketing-prospect.model';
import { MarketingInitiativeActivity } from './marketing-initiative-activity.model';
import { Model } from '@constants/model/type-discriminators';
import { NxAction } from '@models/_core/nx.actions';
import { computed } from '@angular/core';

@Model('MarketingProspectActivity')
export class MarketingProspectActivity extends Serializable {
    static API_PATH = (): string => 'marketing/prospects/activity';
    static DB_TABLE_NAME = (): string => 'marketing_prospect_activities';

    override readonly getName = computed(() => { this.snapshot(); return this.marketing_initiative_activity?.name || $localize`:@@i18n.marketing.prospectActivity:prospect activity`; });

    marketing_prospect_id!: string;
    marketing_initiative_activity_id!: string;
    scheduled_at!: string;
    completed_at?: string;
    status!: 'pending' | 'completed' | 'skipped' | 'overdue' | 'failed';
    notes?: string;
    performance_value?: number;
    bumps: number = 0;

    @Type(()=>MarketingProspect) marketing_prospect?: MarketingProspect;
    @Type(()=>MarketingInitiativeActivity) marketing_initiative_activity?: MarketingInitiativeActivity;

    get marketing_activity(): MarketingInitiativeActivity | undefined {
        return this.marketing_initiative_activity;
    }

    isOverdue = () => new Date(this.scheduled_at) < new Date();

    localizedDescription = (lang = 'de', formality = 'formal'): string => {
        const desc = this.marketing_activity?.description;
        if (!desc) return '';
        if (typeof desc === 'string') return desc;
        return desc.find((v) => v.language === lang && v.formality === formality)?.text
            ?? desc.find((v) => v.language === lang)?.text
            ?? desc[0]?.text ?? '';
    };

    #postpone(days: number) {
        this.httpService.post(`marketing/prospects/${this.marketing_prospect_id}/postpone-activities`, { days }).subscribe();
    }
    #postponeDays(days: number) {
        this.#postpone(days);
    }
    #postponeMonths(months: number) {
        this.#postpone(months * 30);
    }

    protected override buildActions(): NxAction[] {
        return [
            {
                title: $localize`:@@i18n.common.view:view`,
                doubleClick: true,
                action: () => this.navigateTo(`/marketing/prospects/${this.marketing_prospect_id}`),
            },
            {
                title: $localize`:@@i18n.common.reopen:reopen`,
                on: () => this.status !== 'pending',
                group: true,
                action: () => this.update({ status: 'pending' }).pipe(tap((r) => this.status = r.status ?? 'pending')),
            },
            {
                title: $localize`:@@i18n.marketing.mark_as_completed:mark as completed`,
                on: () => this.status === 'pending',
                group: true,
                action: () => this.update({ status: 'completed' }).pipe(tap((r) => this.status = r.status ?? 'completed')),
            },
            {
                title: $localize`:@@i18n.marketing.bump:bump`,
                on: () => this.status === 'pending' || this.status === 'overdue',
                group: true,
                action: () => this.httpService.post(`${MarketingProspectActivity.API_PATH()}/${this.id}/bump`, {}).pipe(tap((r) => this.bumps = (r as { bumps?: number })?.bumps ?? this.bumps + 1)),
            },
            {
                title: $localize`:@@i18n.marketing.postpone:postpone`,
                group: true,
                children: [
                    { group: true, title: $localize`:@@i18n.marketing.postpone_1w:1 week`, action: () => this.#postponeDays(7) },
                    { group: true, title: $localize`:@@i18n.marketing.postpone_2w:2 weeks`, action: () => this.#postponeDays(14) },
                    { group: true, title: $localize`:@@i18n.marketing.postpone_1m:1 month`, action: () => this.#postponeMonths(1) },
                    { group: true, title: $localize`:@@i18n.marketing.postpone_2m:2 months`, action: () => this.#postponeMonths(2) },
                    { group: true, title: $localize`:@@i18n.marketing.postpone_3m:3 months`, action: () => this.#postponeMonths(3) },
                    { group: true, title: $localize`:@@i18n.marketing.postpone_6m:6 months`, action: () => this.#postponeMonths(6) },
                    { group: true, title: $localize`:@@i18n.marketing.postpone_12m:12 months`, action: () => this.#postponeMonths(12) },
                ],
            },
            {
                title: $localize`:@@i18n.common.change_state:change state`,
                group: true,
                children: [
                    {
                        title: $localize`:@@i18n.marketing.mark_as_completed:mark as completed`,
                        group: true,
                        action: () => this.update({ status: 'completed' }).pipe(tap((r) => this.status = r.status ?? 'completed')),
                    },
                    {
                        title: $localize`:@@i18n.tasks.reopen:reopen`,
                        group: true,
                        action: () => this.update({ status: 'pending' }).pipe(tap((r) => this.status = r.status ?? 'pending')),
                    },
                    {
                        title: $localize`:@@i18n.marketing.skip_activity:skip activity`,
                        group: true,
                        action: () => this.update({ status: 'skipped' }).pipe(tap((r) => this.status = r.status ?? 'skipped')),
                    },
                    {
                        title: $localize`:@@i18n.common.overdue:overdue`,
                        group: true,
                        action: () => this.update({ status: 'overdue' }).pipe(tap((r) => this.status = r.status ?? 'overdue')),
                    },
                    {
                        title: $localize`:@@i18n.marketing.failed:failed`,
                        group: true,
                        action: () => this.update({ status: 'failed' }).pipe(tap((r) => this.status = r.status ?? 'failed')),
                    },
                ],
            },
        ];
    }
}
