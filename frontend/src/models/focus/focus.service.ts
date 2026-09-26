import { Service } from '@angular/core';
import { Focus } from '@models/focus/focus.model';
import { Serializable } from '@models/_core/serializable';
import { TalvisHttpService, Page } from '../http/http.talvis';
import { InvoiceItem } from '../invoice/invoice-item.model';
import { Project } from '../project/project.model';
import { Company } from '../company/company.model';
import { Observable } from 'rxjs';
import { User } from '../user/user.model';

@Service()
export class FocusService extends TalvisHttpService<Focus> {
    public apiPath = 'foci';
    override readonly model = Focus;
    indexFor = (_: Serializable) => this.paginate(`${_.apiPathWithId()}/foci`);
    storeFor = (date: string, duration: number, user: User, parentPath?: string) =>
        this.post('foci', { date: date, duration: duration, user_id: user.id, ...(parentPath ? { parent_path: parentPath } : {}) }, Focus);
    getFociFor(project: Project, userIds?: string[], sortField?: string, sortDirection?: string, notYetInvoiced?: boolean, startDate?: string, endDate?: string): Observable<Page<Focus>>;
    getFociFor(company: Company, userIds?: string[], sortField?: string, sortDirection?: string, notYetInvoiced?: boolean, startDate?: string, endDate?: string): Observable<Page<Focus>>;
    getFociFor(_: Project | Company, userIds?: string[], sortField?: string, sortDirection?: string, notYetInvoiced?: boolean, startDate?: string, endDate?: string): Observable<Page<Focus>> {
        const params: any = {};

        if (userIds && userIds.length > 0) {
            params.users = userIds.join(',');
        }

        if (sortField) {
            params.sort = sortField;
            params.direction = sortDirection || 'desc';
        }

        if (notYetInvoiced) {
            params.not_yet_invoiced = true;
        }

        if (startDate) {
            params.start_date = startDate;
        }

        if (endDate) {
            params.end_date = endDate;
        }
        return this.paginate(`${_.apiPathWithId()}/foci`, params);
    }
    uninvoicedFoci = (_: Serializable) => this.aget(`foci/uninvoiced/${_.apiPathWithId()}`);

    createForProject = (project: Project, payload: { duration: number; started_at: string; comment?: string; ext_issue_plugin_link_id?: string; ext_issue_id?: string }) =>
        this.post('timetracker', { project_id: project.id, ...payload }, Focus);

    createInvoiceItemsFor = (_: Serializable, itemIds: string[], desc: string, duration: number, productId: string) =>
        this.post(
            `foci/create-items/${_.apiPathWithId()}`,
            {
                itemIds: itemIds,
                desc: desc,
                duration: duration,
                productId: productId,
            },
            InvoiceItem,
        );
}
