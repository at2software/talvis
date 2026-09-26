import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { modelResource } from '@models/http/model-resource';
import { RouterModule } from '@angular/router';
import { NComponent } from '@shards/n/n.component';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { REFLECTION } from '@constants/constants';
import { Company } from '@models/company/company.model';
import { Project } from '@models/project/project.model';
import { WidgetService } from '@models/widget.service';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { MoneyShortPipe } from '@pipes/mshort.pipe';
import { TabTasksBaseComponent } from '../tab-tasks-base.component';
import { Nx } from '@app/nx/nx.directive';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'tab-tasks-invoiceable',
    templateUrl: './tab-tasks-invoiceable.component.html',
    imports: [NComponent, AvatarComponent, RouterModule, NgbTooltipModule, MoneyShortPipe, DecimalPipe, Nx],
})
export class TabTasksInvoiceableComponent extends TabTasksBaseComponent {
    #widgetService = inject(WidgetService);

    #timeBased = modelResource(this.ready, () => this.#widgetService.indexCashflow('PROJECTS_TIMEBASED', {}, Project));
    #customerSupport = modelResource(this.ready, () => this.#widgetService.indexCashflow('CUSTOMER_SUPPORT', {}, Company));
    #preparedInvoices = modelResource(this.ready, () => this.#widgetService.preparedInvoices());

    constructor() {
        super();
        this.global.onInvoiceCreated.pipe(takeUntilDestroyed()).subscribe(() => this.reload());
    }

    timeBased = computed(() => this.#positiveDesc([this.#timeBased.value()?.objects ?? []].flat(), (p) => p.uninvoiced_hours));
    customerSupport = computed(() => this.#positiveDesc([this.#customerSupport.value()?.objects ?? []].flat(), (c) => c.foci_unbilled_sum_duration));
    preparedInvoices = computed(() => {
        const objects = Object.values(this.#preparedInvoices.value() ?? {})
            .map((x) => REFLECTION<Company | Project>(x))
            .filter((x) => x instanceof Company || x instanceof Project);
        return this.#positiveDesc(objects, (x) => x.net_remaining);
    });

    override reload() {
        this.#timeBased.reload();
        this.#customerSupport.reload();
        this.#preparedInvoices.reload();
    }

    #positiveDesc = <T>(items: T[], by: (item: T) => number | null | undefined): T[] => items
        .filter((item) => (by(item) ?? 0) > 0)
        .sort((a, b) => (by(b) ?? 0) - (by(a) ?? 0));

    asProject = (_: Company | Project) => _ as Project;
    asCompany = (_: Company | Project) => _ as Company;
}
