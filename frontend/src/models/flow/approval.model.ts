import { Serializable } from '@models/_core/serializable';
import { Model } from '@constants/model/type-discriminators';
import { Type } from '@models/_core/hydrate';
import { User } from '@models/user/user.model';
import type { FlowApprovalContextDto, FlowApprovalDecision, FlowApprovalVoteDto } from '@models/_core/api-response';

@Model('Approval')
export class Approval extends Serializable {
    static override API_PATH = (): string => 'flow/approvals';

    subject_type: string = '';
    subject_id: string = '';
    subject_label: string = '';
    subject_link: string | null = null;
    gate_key: string | null = null;
    required_role: string = '';
    required_approvals: number = 1;
    decision: FlowApprovalDecision = 'pending';
    reason: string | null = null;
    context: FlowApprovalContextDto | null = null;
    selected_option: string | null = null;
    votes: FlowApprovalVoteDto[] = [];
    created_at: string = '';

    @Type(() => User) requested_by?: User;

    options = (): string[] => this.context?.options ?? [];
    allowsChangeRequest = (): boolean => this.subject_type.endsWith('\\Job');
    source = (): 'agent' | 'rule_check' | 'review' | null => this.context?.source ?? (this.context?.review_round ? 'review' : null);
    approvalsGiven = (): number => this.votes.filter((_) => _.decision === 'approved').length;
}
