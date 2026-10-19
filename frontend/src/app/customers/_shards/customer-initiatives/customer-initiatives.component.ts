import { ChangeDetectionStrategy, Component, inject, input, linkedSignal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { DatePipe } from '@angular/common';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { forkJoin } from 'rxjs';
import { tracked } from '@constants/tracked';
import { Company } from '@models/company/company.model';
import { MarketingProspectActivity } from '@models/marketing/marketing-prospect-activity.model';
import { MarketingService } from '@models/marketing/marketing.service';
import { modelListResource } from '@models/http/model-resource';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@app/_shards/avatar/avatar.component';
import { CustomerAddToInitiativeModalComponent } from './customer-add-to-initiative-modal/customer-add-to-initiative-modal.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    selector: 'customer-initiatives',
    templateUrl: './customer-initiatives.component.html',
    imports: [RouterModule, NgbTooltipModule, DatePipe, Nx, AvatarComponent, AvatarComponent, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerInitiativesComponent {
    readonly company = input.required<Company>();
    readonly trackedCompany = tracked(this.company);

    #marketingService = inject(MarketingService);
    #modalService = inject(ModalBaseService);

    #prospects = modelListResource(
        () => this.company()?.id || undefined,
        (companyId) => this.#marketingService.indexProspects({ company_id: companyId }),
    );
    activityRowsLoaded = this.#prospects.hasValue;
    activityRows = linkedSignal<MarketingProspectActivity[]>(() => {
        const rows: MarketingProspectActivity[] = [];
        for (const prospect of this.#prospects.value()) {
            for (const activity of prospect.activities ?? []) {
                if (activity.status === 'pending' || activity.status === 'overdue') {
                    activity.marketing_prospect = prospect;
                    rows.push(activity);
                }
            }
        }
        return rows.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    });

    statusIcon = (status: string) => status === 'overdue' ? 'warning' : 'schedule';
    statusClass = (status: string) => status === 'overdue' ? 'text-danger' : 'text-muted';

    onActionResolved = () => this.activityRows.update((rows) => rows.filter((a) => a.status === 'pending' || a.status === 'overdue'));

    openAddModal() {
        this.#modalService
            .open(CustomerAddToInitiativeModalComponent, { company: this.trackedCompany() })
            .then((result) => {
                if (!result?.contact_ids?.length) return;
                const calls = result.contact_ids.map((cid: string) => {
                    const contact = this.trackedCompany().employees?.find((e) => e.id === cid);
                    return this.#marketingService.storeProspect({
                        marketing_initiative_id: result.initiative_id,
                        company_contact_id: cid,
                        company_id: this.trackedCompany().id,
                        name: contact?.getName,
                        status: 'new',
                        added_via: 'manual',
                    });
                });
                forkJoin(calls).subscribe(() => this.#prospects.reload());
            });
    }
}
