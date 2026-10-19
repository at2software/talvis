import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { tracked } from '@constants/tracked';
import { modelResource } from '@models/http/model-resource';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { LoadingPipe } from '@pipes/loading.pipe';
import { MoneyPipe } from '@pipes/money.pipe';
import { GlobalService } from '@models/global.service';
import { ProductService } from '@models/product/product.service';
import { Company } from '@models/company/company.model';
import { InvoiceItem } from '@models/invoice/invoice-item.model';
import { ProductDetailGuard } from '../product-details.guard';
import { AutosaveDirective } from '@directives/autosave.directive';
import { RteComponent } from '@shards/rte/rte.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { FormsModule } from '@angular/forms';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { CompactItemDirective } from '@shards/ul-compact/CompactItemDirective';
import { UlCompactComponent } from '@shards/ul-compact/ul-compact.component';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    selector: 'app-product-detail-overview',
    templateUrl: './product-detail-overview.component.html',
    imports: [ValueUnitComponent, AutosaveDirective, FormsModule, RteComponent, Nx, AvatarComponent, NgbDropdownModule, NgbTooltipModule, MoneyShortPipe, LoadingPipe, MoneyPipe, UlCompactComponent, CompactItemDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailOverviewComponent {
    readonly parent = inject(ProductDetailGuard);
 readonly object = tracked(this.parent.object);
    readonly global = inject(GlobalService);

    readonly #productService = inject(ProductService);
    readonly #customersData = modelResource(
        () => this.parent.object()?.id || undefined,
        (id) => this.#productService.indexCustomers(id),
    );

    readonly item = signal<InvoiceItem | undefined>(undefined);
    readonly customers = computed<Company[]>(() => this.#customersData.value()?.customers ?? []);
    readonly totalRevenue = computed<number | null>(() => this.#customersData.value()?.total_revenue ?? null);
    readonly totalCustomers = computed<number>(() => this.#customersData.value()?.total_customers ?? 0);
    readonly currentPriceSourceText = computed(() => {
        switch (this.object()?.time_based) {
            case 0: return $localize`:@@i18n.common.individualInvoiceItem:individual invoice item`;
            case 1: return $localize`:@@i18n.common.hourly:hourly`;
            case 8: return $localize`:@@i18n.common.daily:daily`;
            default: return '';
        }
    });
    readonly basePrice = computed(() => {
        const product = this.object();
        if (!product || product.time_based === 0) return 0;
        let price = parseFloat(this.global.setting('INVOICE_HOURLY_WAGE'));
        if (product.time_based === 8) price *= parseFloat(this.global.setting('INVOICE_HPD'));
        return price;
    });
    readonly computedPrice = computed(() => this.basePrice() * (this.object()?.price_multiplier || 1));

    constructor() {
        effect(() => this.item.set(this.parent.object()?.getInvoiceItem()?.getClone()));
    }

    readonly setTimeBased = (value: number) => this.parent.object().update({ time_based: value }).subscribe();

    readonly setItemType = (type: number) => {
        const item = this.item();
        if (!item) return;
        item.type = type;
        item.update({ type }).subscribe();
    };
}
