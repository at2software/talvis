import { ChangeDetectionStrategy, Component, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { tracked } from '@constants/tracked';
import { Router } from '@angular/router';
import { CompanyService } from '@models/company/company.service';
import { Connection } from '@models/company/connection.model';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';
import { NetworkChart } from '@shards/network-chart/network-chart.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { NgbPopoverModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { modelListResource } from '@models/http/model-resource';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    selector: 'customer-connections',
    templateUrl: './customer-connections.html',
    styleUrls: ['./customer-connections.scss'],
    imports: [ScrollbarComponent, NgbPopoverModule, NgbTooltipModule, SearchInputComponent, Nx, AvatarComponent, NetworkChart, EmptyStateComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerConnections {
    #parent = inject(CustomerDetailGuard);
    #companyService = inject(CompanyService);
    #router = inject(Router);

    myCompany = tracked(this.#parent.object);
    selectedCompany = signal<Company | null>(null);

    chart = viewChild.required(NetworkChart);
    popSearch = viewChild<SearchInputComponent>('popSearch');

    #connections = modelListResource(
        () => this.#parent.object()?.id || undefined,
        (companyId) => this.#companyService.showConnections(companyId),
    );
    connections = linkedSignal<Connection[], Connection[]>({
        source: this.#connections.value,
        computation: (rows) => {
            const myCompany = untracked(this.myCompany);
            rows.forEach((_) => _.addCompanyAction(_.otherCompany(myCompany)));
            return rows;
        },
    });
    connectionsLoaded = this.#connections.hasValue;

    reload = () => this.#connections.reload();

    singleActionResolved() {
        this.chart().updateData();
    }

    onCompanySelect(_: Serializable) {
        const company = _.assert(Company);
        if (!company) return;
        const myCompany = this.myCompany();
        Connection.fromJson({ company1_id: myCompany.id, company2_id: company.id })
            .store()
            .subscribe((_) => {
                const n = Connection.fromJson(_);
                n.addCompanyAction(n.otherCompany(myCompany));
                this.connections.update((connections) => [...connections, n]);
                this.chart().updateData();
            });
    }

    createNewCompany(searchInput: SearchInputComponent | undefined) {
        const query = searchInput?.query();
        if (!query) return;
        this.#companyService.create(query).subscribe((company) => this.onCompanySelect(company));
    }

    onNodeSelected(companyId: string | null) {
        if (!companyId) {
            this.selectedCompany.set(null);
            return;
        }
        for (const conn of this.connections()) {
            if (String(conn.company1?.id) === companyId) { this.selectedCompany.set(conn.company1); return; }
            if (String(conn.company2?.id) === companyId) { this.selectedCompany.set(conn.company2); return; }
        }
    }

    navigateToCompany() {
        const selectedCompany = this.selectedCompany();
        if (selectedCompany) this.#router.navigate(['/customers', selectedCompany.id]);
    }

    onPopoverShown() {
        setTimeout(() => this.popSearch()?.focus(), 0);
    }
}
