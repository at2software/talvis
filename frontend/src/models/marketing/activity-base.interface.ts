import { QuickActionType } from './marketing-activity.model';
import { MarketingPerformanceMetric } from './marketing-performance-metrics.model';
import type { ActivityStatsDto } from '@models/_core/api-response';

export interface IActivityBase {
    id: string;
    name: string;
    day_offset: number;
    description: string | any;
    is_required: boolean;
    has_external_dependency?: boolean;
    parent_activity_id?: string;
    quick_action?: QuickActionType;
    is_shared?: boolean;
    performance_metrics?: MarketingPerformanceMetric[];
    stats?: ActivityStatsDto;
}
