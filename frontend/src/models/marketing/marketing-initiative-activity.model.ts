import { Serializable } from '@models/_core/serializable';
import { Type } from '@models/_core/hydrate';
import { MarketingInitiative } from './marketing-initiative.model';
import { MarketingWorkflow } from './marketing-workflow.model';
import { MarketingPerformanceMetric } from './marketing-performance-metrics.model';
import { QuickActionType } from './marketing-activity.model';
import { IActivityBase } from './activity-base.interface';
import { Model } from '@constants/model/type-discriminators';
import type { ActivityStatsDto } from '@models/_core/api-response';

@Model('MarketingInitiativeActivity')
export class MarketingInitiativeActivity extends Serializable implements IActivityBase {
    static API_PATH = (): string => 'marketing/initiative-activities';
    static DB_TABLE_NAME = (): string => 'marketing_initiative_activities';

    marketing_initiative_id!: string;
    marketing_workflow_id?: string;
    name!: string;
    day_offset!: number;
    description!: string | { language: string; formality: string; text: string }[];
    is_required!: boolean;
    has_external_dependency?: boolean;
    parent_activity_id?: string;
    quick_action?: QuickActionType;
    is_shared?: boolean;
    due_count?: number;
    stats?: ActivityStatsDto;

    @Type(()=>MarketingInitiative) marketing_initiative?: MarketingInitiative;
    @Type(()=>MarketingWorkflow) marketing_workflow?: MarketingWorkflow;
    @Type(()=>MarketingInitiativeActivity) parent_activity?: MarketingInitiativeActivity;
    @Type(()=>MarketingInitiativeActivity) child_activities?: MarketingInitiativeActivity[];
    @Type(()=>MarketingPerformanceMetric) performance_metrics?: MarketingPerformanceMetric[];

}
