import { Serializable } from '@models/_core/serializable';
import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Type } from '@models/_core/hydrate';
import { MarketingActivity } from './marketing-activity.model';
import { MarketingInitiative } from './marketing-initiative.model';
import { TPivot } from './marketing-performance-metrics.model';
import { Model } from '@constants/model/type-discriminators';
import { firstValueFrom } from 'rxjs';
import type { ActivityStatsDto } from '@models/_core/api-response';

export interface TProspectStats {
    new: number;
    engaged: number;
    unresponsive: number;
    converted: number;
    disqualified: number;
    on_hold: number;
    total: number;
}

@Model('MarketingWorkflow')
export class MarketingWorkflow extends Serializable {
    static API_PATH = (): string => 'marketing_workflows';

    name!: string;
    description?: string;
    is_active!: boolean;
    stats?: ActivityStatsDto;
    prospects_count?: number;
    prospect_stats?: TProspectStats;
    pivot?: TPivot<'marketing_initiative', 'marketing_workflow'> & { is_active?: boolean };

    @Type(()=>MarketingActivity) marketing_activities?: MarketingActivity[];
    @Type(()=>MarketingInitiative) marketing_initiatives?: MarketingInitiative[];

    protected override buildActions(): NxAction[] {
        return [
            {
                title: $localize`:@@i18n.marketing.unlink_from_initiative:unlink from initiative`,
                group: true,
                type: NxActionType.Destructive,
                context: 'initiative_details',
                action: () => {
                    const removeActivities = confirm('Do you also want to remove all prospect activities from this workflow?\n\n' + 'Click OK to remove activities, Cancel to keep them.');
                    return this.httpService.delete(`marketing/initiatives/${this.pivot?.marketing_initiative_id}/workflows/${this.id}`, { body: { remove_prospect_activities: removeActivities } });
                },
                roles: 'marketing',
            },
            {
                title: $localize`:@@i18n.common.delete:delete`,
                group: true,
                type: NxActionType.Destructive,
                context: '!initiative_details',
                action: () => this.modalConfirm().then(() => firstValueFrom(this.httpService.delete(`marketing/workflows/${this.id}`)).then(() => this)),
                hotkey: 'DEL',
                roles: 'marketing',
            },
        ];
    }
}
