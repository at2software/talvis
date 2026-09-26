import { Service } from '@angular/core';
import { serialize } from '@constants/rxjs/rxjs-operators';
import { Observable } from 'rxjs';
import { ProductGroup } from './product-group.model';
import { TalvisHttpService } from '../http/http.talvis';
import { Company } from '../company/company.model';
import { ProductCustomersDto } from '@models/_core/api-response';

@Service()
export class ProductGroupService extends TalvisHttpService<ProductGroup> {
    public apiPath = 'product_groups';
    override readonly model = ProductGroup;

    indexCustomers = (id: string | number): Observable<ProductCustomersDto> =>
        this.get(`product_groups/${id}/customers`, {}, Object).pipe(serialize('customers', Company));
}
