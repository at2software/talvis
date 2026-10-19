import { Serializable } from '@models/_core/serializable';
import { Model } from '@constants/model/type-discriminators';
import type { Dictionary } from '@constants/constants';
import type { FlowJobApprovalDto, FlowJobEventDto } from '@models/_core/api-response';

export type FlowJobState = 'open' | 'claimed' | 'running' | 'awaiting_gate' | 'in_review' | 'completed' | 'failed' | 'rejected';

const STATE_CLASS: Record<FlowJobState, string> = {
    open: 'bg-dark',
    claimed: 'bg-info text-dark',
    running: 'bg-info text-dark',
    awaiting_gate: 'bg-warning text-dark',
    in_review: 'bg-warning text-dark',
    completed: 'bg-success',
    failed: 'bg-danger',
    rejected: 'bg-danger',
};

@Model('Job')
export class FlowJob extends Serializable {
    static override API_PATH = (): string => 'flow/jobs';

    project_id: string = '';
    type: string = '';
    state: FlowJobState = 'open';
    input: Dictionary = {};
    output: Dictionary | null = null;
    claimed_by: string | null = null;
    claimed_at: string | null = null;
    metrics: Dictionary<number> | null = null;
    knowledge: Dictionary | null = null;
    approvals: FlowJobApprovalDto[] = [];
    last_event: FlowJobEventDto | null = null;
    created_at: string = '';

    stateClass = (): string => STATE_CLASS[this.state] ?? 'bg-dark';
    mrUrls = (): string[] => {
        const urls = (this.output?.['mr_urls'] as string[] | null | undefined) ?? [];
        const single = this.output?.['mr_url'] as string | null | undefined;
        return single && !urls.includes(single) ? [single, ...urls] : urls;
    };
}
