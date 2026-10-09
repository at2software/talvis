import type { NxAction } from '@models/_core/nx.actions';
import { nx } from '@models/_core/nx-bridge';
import { Product } from './product.model';
import { Serializable } from '@models/_core/serializable';
import { getProductGroupActions } from './product-group.actions';
import { Observable, map } from 'rxjs';
import { Type } from '@models/_core/hydrate';
import { Model } from '@constants/model/type-discriminators';
import { Dictionary } from '@constants/constants';

@Model('ProductGroup')
export class ProductGroup extends Serializable {

    protected override buildActions(): NxAction[] { return getProductGroupActions(this) }

    name: string = '';
    symbol: string = '';
    expanded: boolean = false;
    is_active: boolean = true;
    color: string = 'ffffff';
    net: number = 0;
    quote: string = '';

    @Type(()=>ProductGroup) child_groups!: ProductGroup[];
    @Type(()=>Product) products!: Product[];

    set products_min(g: any[]) {
        this.products = g.map((_) => Product.fromJson(_));
    }

    static API_PATH = (): string => 'product_groups';
    frontendUrl = (): string => `/products/group/${this.id}`;
    put = (path: string) => nx().service.put(`product_groups/${this.id}/${path}`, {}).subscribe((_) => this.patch(_ as Dictionary));

    static createWithParentId = (name: string = 'New product group', parentId: string | undefined = undefined): Observable<ProductGroup> => nx().service.post('product_groups', { name: name, product_group_id: parentId }).pipe(map((x) => ProductGroup.fromJson(x)));
    static promptCreate = () =>
        nx()
            .promptInput($localize`:@@i18n.common.name:name`)
            .confirmed(({ text }) => ProductGroup.createWithParentId(text).subscribe((x) => nx().navigateTo('/products/group/' + x.id)));
}
