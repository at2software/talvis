import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CompanyService } from '@models/company/company.service';
import { Company } from '@models/company/company.model';
import { Connection, ConnectionType } from '@models/company/connection.model';
import { NetworkChart } from '@shards/network-chart/network-chart.component';
import { GlobalService } from '@models/global.service';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { modelListResource } from '@models/http/model-resource';

type TypeFilterKey = ConnectionType | 'none';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customers-network',
    templateUrl: './customers-network.component.html',
    styleUrls: ['./customers-network.component.scss'],
    imports: [NetworkChart, EmptyStateComponent, SpinnerComponent],
})
export class CustomersNetworkComponent {
    #global = inject(GlobalService);
    #companyService = inject(CompanyService);
    #router = inject(Router);

    readonly types = Connection.TYPES;

    selectedCompany = signal<Company | null>(null);
    focusCompanyId = signal<string | null>(this.#global.me_id ? String(this.#global.me_id) : null);
    hiddenTypes = signal<ReadonlySet<TypeFilterKey>>(new Set());

    #connections = modelListResource(() => this.#companyService.indexAllConnections());
    connections = this.#connections.value;
    loading = this.#connections.isLoading;

    typeCounts = computed(() => {
        const counts = new Map<TypeFilterKey, number>();
        for (const c of this.connections()) counts.set(c.type ?? 'none', (counts.get(c.type ?? 'none') ?? 0) + 1);
        return counts;
    });

    visibleConnections = computed(() => {
        const hidden = this.hiddenTypes();
        return this.connections().filter((c) => !hidden.has(c.type ?? 'none'));
    });

    reload = () => this.#connections.reload();

    toggleType(key: TypeFilterKey) {
        this.hiddenTypes.update((hidden) => {
            const next = new Set(hidden);
            if (!next.delete(key)) next.add(key);
            return next;
        });
    }

    onNodeSelected(companyId: string | null) {
        if (!companyId) {
            this.selectedCompany.set(null);
            return;
        }

        for (const conn of this.connections()) {
            if (String(conn.company1?.id) === companyId) {
                this.selectedCompany.set(conn.company1);
                return;
            }
            if (String(conn.company2?.id) === companyId) {
                this.selectedCompany.set(conn.company2);
                return;
            }
        }
    }

    openNetwork(companyId: string) {
        this.#router.navigate(['/customers', companyId, 'connections']);
    }

    navigateToCompany() {
        if (this.selectedCompany()) {
            this.#router.navigate(['/customers', this.selectedCompany()!.id]);
        }
    }
}
