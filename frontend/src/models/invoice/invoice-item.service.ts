import { Service } from '@angular/core';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { TalvisHttpService } from '@models/http/http.talvis';
import { Company } from '@models/company/company.model';
import { Project } from '@models/project/project.model';
import { Serializable } from '@models/_core/serializable';
import { Dictionary } from '@constants/constants';

@Service()
export class InvoiceItemService extends TalvisHttpService<InvoiceItem> {
    public apiPath = 'invoice_items';
    override readonly model = InvoiceItem;

    getInvoiceItems = (parent: Serializable, data?: Dictionary) => this.aget(parent.apiPathWithId() + '/invoice-items', data);
    getSupportItems = (parent: Serializable, data?: Dictionary) => this.aget(parent.apiPathWithId() + '/invoice-items', { support_only: true, ...data });

    indexEstimationItems = (project: Project) => this.aget(`projects/${project.id}/invoice-items/estimation`, null, InvoiceItem);
    indexStandingOrders = (company?: Company | string) => {
        const companyId = company instanceof Company ? company.id : company;
        return this.aget('invoice_items/standing-orders', companyId ? { company_id: companyId } : {});
    };

    prepareInvoice = (project: Project) => this.post(`projects/${project.id}/prepare_invoice`);

    reorder = (_: string[]) => this.put('invoice_items/reorder', { order: _ });
    combine = (itemIds: string[], description: string) => this.post('invoice_items/combine', { item_ids: itemIds, description });
}
