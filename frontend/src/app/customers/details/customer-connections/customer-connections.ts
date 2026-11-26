import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { tracked } from '@constants/tracked';
import { Router } from '@angular/router';
import { CompanyService } from '@models/company/company.service';
import { Connection } from '@models/company/connection.model';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';
import { NetworkChart, UNCLASSIFIED_COLOR } from '@shards/network-chart/network-chart.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { NgbPopoverModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { modelResource } from '@models/http/model-resource';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

interface RoleGroup {
    label: string;
    color: string;
    connections: Connection[];
}

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

    readonly roles = Connection.ROLES;
    readonly unclassifiedLabel = $localize`:@@i18n.connections.unclassified:unclassified`;

    myCompany = tracked(this.#parent.object);
    selectedCompany = signal<Company | null>(null);
    newRole = signal('');
    secondDegreeCollapsed = signal(true);

    chart = viewChild(NetworkChart);
    popSearch = viewChild<SearchInputComponent>('popSearch');

    #network = modelResource(
        () => this.#parent.object()?.id || undefined,
        (companyId) => this.#companyService.showNetwork(companyId),
    );
    connections = linkedSignal<Connection[]>(() => {
        const myCompany = untracked(this.myCompany);
        const rows = this.#network.value()?.connections ?? [];
        rows.forEach((_) => _.addCompanyAction(_.otherCompany(myCompany)));
        return rows;
    });
    depth = computed(() => this.#network.value()?.depth ?? null);
    path = computed(() => this.#network.value()?.path ?? []);
    connectionsLoaded = computed(() => this.#network.hasValue() || this.#network.error() !== undefined);

    directConnections = computed(() => {
        const rootId = this.myCompany()?.id;
        if (!rootId) return [];
        return this.connections().filter((_) => _.company1_id == rootId || _.company2_id == rootId);
    });

    roleGroups = computed((): RoleGroup[] => {
        const myCompany = this.myCompany();
        if (!myCompany) return [];
        const groups = new Map<string, RoleGroup>(Connection.ROLES.map((_) => [_.value, { label: _.label, color: Connection.TYPES.find((type) => type.key === _.type)!.color, connections: [] }]));
        const unclassified: RoleGroup = { label: this.unclassifiedLabel, color: UNCLASSIFIED_COLOR, connections: [] };
        for (const connection of this.directConnections()) {
            const other = connection.otherCompany(myCompany);
            const option = connection.typeOption();
            if (!option || !other) {
                unclassified.connections.push(connection);
                continue;
            }
            const key = `${option.key}:${option.directed && connection.company2_id == other.id ? 2 : 1}`;
            groups.get(key)!.connections.push(connection);
        }
        return [...groups.values(), unclassified].filter((_) => _.connections.length);
    });

    secondDegree = computed(() => {
        const depth = this.depth() ?? {};
        const companies = new Map<string, Company>();
        for (const connection of this.connections()) {
            for (const company of [connection.company1, connection.company2]) {
                if (company && (depth[String(company.id)] ?? 0) >= 2) companies.set(String(company.id), company);
            }
        }
        return [...companies.values()].sort((a, b) => (b.net || 0) - (a.net || 0));
    });

    reload = () => this.#network.reload();

    singleActionResolved() {
        this.connections.update((rows) => [...rows]);
        this.chart()?.updateData();
    }

    onCompanySelect(_: Serializable) {
        const company = _.assert(Company);
        if (!company) return;
        Connection.fromJson(Connection.payloadFor(this.myCompany(), company, this.newRole()))
            .store()
            .subscribe(() => this.reload());
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

    openNetwork(companyId: string) {
        this.selectedCompany.set(null);
        this.#router.navigate(['/customers', companyId, 'connections']);
    }

    navigateToCompany() {
        const selectedCompany = this.selectedCompany();
        if (selectedCompany) this.#router.navigate(['/customers', selectedCompany.id]);
    }

    onPopoverShown() {
        setTimeout(() => this.popSearch()?.focus(), 0);
    }
}
