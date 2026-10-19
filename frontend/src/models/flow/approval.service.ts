import { Service } from '@angular/core';
import { TalvisHttpService } from '@models/http/http.talvis';
import { Approval } from './approval.model';

@Service()
export class FlowApprovalService extends TalvisHttpService<Approval> {
    apiPath = 'flow/approvals';
    override readonly model = Approval;

    approve = (approval: Approval, reason: string, selectedOption?: string) => this.post(`${this.apiPath}/${approval.id}/approve`, { reason: reason || null, selected_option: selectedOption ?? null });
    reject = (approval: Approval, reason: string) => this.post(`${this.apiPath}/${approval.id}/reject`, { reason });
    requestChanges = (approval: Approval, reason: string) => this.post(`${this.apiPath}/${approval.id}/request-changes`, { reason });
}
