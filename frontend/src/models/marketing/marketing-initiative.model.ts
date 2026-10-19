import { Serializable } from '@models/_core/serializable';
import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Type } from '@models/_core/hydrate';
import { MarketingPerformanceMetric, TPivot } from './marketing-performance-metrics.model';
import { MarketingWorkflow } from './marketing-workflow.model';
import { MarketingInitiativeActivity } from './marketing-initiative-activity.model';
import { User } from '@models/user/user.model';
import { Model } from '@constants/model/type-discriminators';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { nx, TBroadcast } from '@models/_core/nx-bridge';
import { MODAL } from '@models/_core/modal-registry';
import { ModalInputResult } from '@models/_core/modal-results';
import type { Dictionary } from '@constants/constants';

@Model('MarketingInitiative')
export class MarketingInitiative extends Serializable {
    static API_PATH = (): string => 'marketing/initiatives';
    static DB_TABLE_NAME = (): string => 'marketing_initiatives';

    override update(changes?: Dictionary, silent = false): Observable<this> {
        return super.update(changes, silent).pipe(tap(() => nx().broadcast({ type: TBroadcast.Update, data: this })));
    }

    name!: string;
    description?: string;
    status!: 'active' | 'paused' | 'completed';
    start_date?: Date;
    end_date?: Date;
    parent_id?: number;
    pivot?: TPivot<'marketing_initiative', 'marketing_workflow'> & { is_active?: boolean };
    channels?: { id: number; name?: string; pivot?: { is_primary?: boolean; [k: string]: unknown }; [k: string]: unknown }[];
    prospects_count?: number;
    overdue_prospects_count?: number;
    company_prospects_count?: number;

    @Type(()=>MarketingPerformanceMetric) performance_metrics?: MarketingPerformanceMetric[];
    @Type(()=>MarketingWorkflow) workflows?: MarketingWorkflow[];
    @Type(()=>MarketingInitiativeActivity) initiative_activities?: MarketingInitiativeActivity[];
    @Type(()=>User) users?: User[];
    @Type(()=>MarketingInitiative) children?: MarketingInitiative[];

    protected override buildActions(): NxAction[] {
        return [
            {
                title: $localize`:@@i18n.common.open:open`,
                doubleClick: true,
                action: () => this.navigateTo(`/marketing/initiatives`),
            },
            {
                title: $localize`:@@i18n.common.rename:rename`,
                roles: 'marketing',
                action: (success) => {
                    nx().openModal<ModalInputResult>(MODAL.input, { title: $localize`:@@i18n.common.rename:rename`, initialValue: this.name })
                        .then((result) => {
                            const name = result?.text?.trim();
                            if (name && name !== this.name) this.update({ name }).subscribe(() => success?.(undefined));
                        });
                },
            },
            {
                title: 'Change state to...',
                group: true,
                children: [
                    {
                        title: 'Active',
                        on: () => this.status !== 'active',
                        action: () => this.update({ status: 'active' }),
                    },
                    {
                        title: 'Paused',
                        on: () => this.status !== 'paused',
                        action: () => this.update({ status: 'paused' }),
                    },
                    {
                        title: 'Completed',
                        on: () => this.status !== 'completed',
                        action: () => this.update({ status: 'completed' }),
                    },
                ],
            },
            {
                title: $localize`:@@i18n.common.delete:delete`,
                group: true,
                type: NxActionType.Destructive,
                action: () => this.modalConfirm().then(() => firstValueFrom(this.httpService.delete(`marketing/initiatives/${this.id}`)).then(() => this)),
                hotkey: 'DEL',
                roles: 'marketing',
            },
        ];
    }

    leadSourceId = (): number | null => this.channels?.find((c) => c.pivot?.is_primary)?.id ?? this.channels?.[0]?.id ?? null;
}
