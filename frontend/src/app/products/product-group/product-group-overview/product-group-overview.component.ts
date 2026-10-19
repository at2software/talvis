import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { tracked } from '@constants/tracked';
import { modelResource } from '@models/http/model-resource';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { LoadingPipe } from '@pipes/loading.pipe';
import { ProductGroupService } from '@models/product/product-group.service';
import { Company } from '@models/company/company.model';
import { ProductGroupDetailGuard } from '../product-group-detail.guard';
import { AutosaveDirective } from '@directives/autosave.directive';
import { ColorPickerDirective } from 'ngx-color-picker';
import { RteComponent } from '@shards/rte/rte.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { Nx } from '@app/nx/nx.directive';
import { FormsModule } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    selector: 'app-product-group-overview',
    templateUrl: './product-group-overview.component.html',
    imports: [ValueUnitComponent, AutosaveDirective, FormsModule, ColorPickerDirective, RteComponent, AvatarComponent, Nx, AvatarComponent, NgbTooltipModule, MoneyShortPipe, LoadingPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductGroupOverviewComponent {
    readonly parent = inject(ProductGroupDetailGuard);
 readonly object = tracked(this.parent.object);

    readonly #productGroupService = inject(ProductGroupService);
    readonly #data = modelResource(
        () => this.parent.object()?.id || undefined,
        (id) => this.#productGroupService.indexCustomers(id),
    );

    readonly customers = computed<Company[]>(() => this.#data.value()?.customers ?? []);
    readonly totalRevenue = computed<number | null>(() => this.#data.value()?.total_revenue ?? null);
    readonly totalCustomers = computed<number>(() => this.#data.value()?.total_customers ?? 0);
}
