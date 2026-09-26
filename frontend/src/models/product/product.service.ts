import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { mapVar, serialize } from '@constants/rxjs/rxjs-operators';
import { Observable } from 'rxjs';
import { Product } from './product.model';
import { TalvisHttpService } from '../http/http.talvis';
import { Company } from '../company/company.model';
import { ProductGroup } from './product-group.model';
import { ProductCustomersDto, ProductSplitItemDto, ProductStatisticsDto } from '@models/_core/api-response';

@Service()
export class ProductService extends TalvisHttpService<Product> {
    public apiPath = 'products';
    override readonly model = Product;

    show = (id: string | number) => this.get(`products/${id}`, { with: 'invoice_items' });

    indexCustomers = (id: string | number): Observable<ProductCustomersDto> =>
        this.get(`products/${id}/customers`, {}, Object).pipe(serialize('customers', Company));

    showStatistics = (filters?: Dictionary): Observable<ProductStatisticsDto> =>
        this.get('products/statistics', filters ?? {}, Object).pipe(
            mapVar(['total_revenue'], 'top_products'),
            mapVar(['average_sales_speed'], 'fastest_sellers'),
            mapVar(['average_repurchase_frequency'], 'most_repurchased'),
            serialize('top_products', Product),
            serialize('fastest_sellers', Product),
            serialize('most_repurchased', Product),
        );

    getRootGroups = () => this.aget('products/root-groups', {}, ProductGroup);
    getSplit = (id: string | number) => this.aget<ProductSplitItemDto>(`products/${id}/split`);
}
