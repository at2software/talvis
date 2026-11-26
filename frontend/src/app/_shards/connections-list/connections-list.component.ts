import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { CompanyService } from '@models/company/company.service';
import { Connection } from '@models/company/connection.model';
import { Company } from '@models/company/company.model';
import { Serializable } from '@models/_core/serializable';
import { map } from 'rxjs';
import { NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { GlobalService } from '@models/global.service';
import { tracked } from '@constants/tracked';
import { modelListResource } from '@models/http/model-resource';
import { ConnectionRole } from '@shards/connection-role/connection-role';

@Component({
    selector: 'connections-list',
    templateUrl: './connections-list.component.html',
    styleUrls: ['./connections-list.component.scss'],
    imports: [NgbPopoverModule, SearchInputComponent, Nx, AvatarComponent, ConnectionRole],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionsListComponent {
    readonly company = input<Company>();
    readonly trackedCompany = tracked(this.company);
    showAddButton = input(false);
    hideMyCompany = input(false);
    added = output<Connection>();
    updated = output<void>();

    #global = inject(GlobalService);
    #companyService = inject(CompanyService);

    readonly #connections = modelListResource(
        () => this.company()?.id || undefined,
        (id) =>
            this.#companyService.showConnections(id).pipe(
                map((connections) => {
                    for (const c of connections) c.addCompanyAction(c.otherCompany(this.company()!));
                    return connections;
                }),
            ),
    );
    connections = linkedSignal(this.#connections.value);

    filteredConnections = computed(() => {
        const company = this.trackedCompany();
        const connections = this.connections();
        if (!this.hideMyCompany() || !company) return connections;
        return connections.filter((c) => c.otherCompany(company)?.id !== this.#global.me_id);
    });

    reload = () => this.#connections.reload();

    singleActionResolved() {
        this.updated.emit();
        this.reload();
    }

    onCompanySelect(selected: Serializable) {
        const target = selected.assert(Company);
        if (!target) return;

        const company = this.trackedCompany();
        if (!company) return;

        Connection.fromJson({
            company1_id: company.id,
            company2_id: target.id,
        })
            .store()
            .subscribe((data) => {
                const connection = Connection.fromJson(data);
                connection.addCompanyAction(connection.otherCompany(company));
                this.connections.update((list) => [...list, connection]);
                this.updated.emit();
            });
    }

    createNewCompany(searchInput: { query: () => string }) {
        if (!searchInput.query()) return;
        this.#companyService.create(searchInput.query()).subscribe((data) => {
            this.onCompanySelect(Company.fromJson(data));
        });
    }

    addConnection(connection: Connection) {
        this.added.emit(connection);
    }
}
