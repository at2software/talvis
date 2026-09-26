import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { NgbPopover, NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap';
import { Nx } from '@app/nx/nx.directive';
import { tracked } from '@constants/tracked';
import { CompanyContactStoreDto } from '@models/_core/api-response';
import { Serializable } from '@models/_core/serializable';
import { CompanyContact } from '@models/company/company-contact.model';
import { CompanyContactService } from '@models/company/company-contact.service';
import { Company } from '@models/company/company.model';
import { CompanyService } from '@models/company/company.service';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { SearchInputComponent } from '@shards/search-input/search-input.component';
import { CompactItemDirective } from '@shards/ul-compact/CompactItemDirective';
import { UlCompactComponent } from '@shards/ul-compact/ul-compact.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'contact-employments',
    templateUrl: './contact-employments.html',
    imports: [NgbPopoverModule, SearchInputComponent, AvatarComponent, Nx, UlCompactComponent, CompactItemDirective],
})
export class ContactEmployments {
    readonly card = input.required<CompanyContact>();

    readonly #trackedCard = tracked(this.card);
    readonly #revision = signal(0);

    readonly siblings = computed(() => this.#trackedCard().contact.company_contacts);
    readonly employments = computed(() => {
        this.#revision();
        return this.siblings().filter((_) => _.company && _.company_id !== this.card().company_id);
    });

    private readonly popSearch = viewChild<SearchInputComponent>('popSearch');

    #companyContactService = inject(CompanyContactService);
    #companyService = inject(CompanyService);

    onPopoverShown = () => setTimeout(() => this.popSearch()?.focus(), 0);
    onActionsResolved = () => this.#revision.update((_) => _ + 1);

    onCompanySelect(selected: Serializable, popover?: NgbPopover) {
        const company = selected.assert(Company);
        if (!company) return;
        const card = this.card();
        if (company.id === card.company_id || this.employments().some((_) => _.company_id === company.id)) return;

        popover?.close();
        this.#companyContactService
            .link<CompanyContactStoreDto>({
                company_id: company.id,
                contact_id: card.contact_id,
                vcard: 'TEL:\nEMAIL:\nTEL;type=cell:\nTITLE:',
            })
            .subscribe((response) => {
                this.siblings().push(CompanyContact.fromJson(response));
                this.onActionsResolved();
            });
    }

    createNewCompany(searchInput: SearchInputComponent | undefined, popover?: NgbPopover) {
        const query = searchInput?.query();
        if (!query) return;
        this.#companyService.create(query).subscribe((company) => this.onCompanySelect(company, popover));
    }

    onUnlink(employment: CompanyContact) {
        this.siblings().remove(employment);
        this.onActionsResolved();
        this.#companyContactService.unlink(employment.contact_id, employment.company_id).subscribe();
    }
}
