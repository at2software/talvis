import { Serializable } from '@models/_core/serializable';
import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Type } from '@models/_core/hydrate';
import { MarketingPerformanceMetric, TPivot } from './marketing-performance-metrics.model';
import { MarketingWorkflow } from './marketing-workflow.model';
import { MarketingInitiativeActivity } from './marketing-initiative-activity.model';
import { User } from '@models/user/user.model';
import { Model } from '@constants/model/type-discriminators';
import { firstValueFrom } from 'rxjs';

@Model('MarketingInitiative')
export class MarketingInitiative extends Serializable {
    static API_PATH = (): string => 'marketing/initiatives';
    static DB_TABLE_NAME = (): string => 'marketing_initiatives';
    

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
}
