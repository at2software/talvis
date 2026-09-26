import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { tracked } from '@constants/tracked';
import { CompanyService } from '@models/company/company.service';
import { CompanyContact } from '@models/company/company-contact.model';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { ListGroupItemContactComponent } from '@app/customers/_shards/list-group-item-contact/list-group-item-contact.component';
import { Nx } from '@app/nx/nx.directive';
import { NxStatic, TBroadcast } from '@app/nx/nx.static';
import { ProjectComponent } from '@shards/project/project.component';
import { NxComponent } from '@shards/nx/nx.component';
import { FormsModule } from '@angular/forms';
import { AutosaveDirective } from '@directives/autosave.directive';
import { VcardComponent } from '@app/customers/_shards/vcard/vcard.component';
import { ContactEmployments } from '@app/customers/_shards/contact-employments/contact-employments';

@Component({
    selector: 'customer-vcards',
    templateUrl: './customer-vcards.html',
    imports: [ScrollbarComponent, ListGroupItemContactComponent, Nx, ProjectComponent, RouterModule, VcardComponent, NxComponent, FormsModule, AutosaveDirective, ContactEmployments],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerVcards {
    #parent = inject(CustomerDetailGuard);
    #companyService = inject(CompanyService);
    #router = inject(Router);
    #route = inject(ActivatedRoute);
    #host = inject(ElementRef<HTMLElement>);

    company = tracked(this.#parent.object);

    constructor() {
        NxStatic.broadcast$.pipe(takeUntilDestroyed()).subscribe((event) => {
            if (event.type === TBroadcast.Delete && event.data instanceof CompanyContact) this.#parent.reload();
        });
    }

    onAddEmployee = () =>
        this.#companyService.createEmployee(this.company().id).subscribe((created) => {
            this.company().employees.push(created);
            this.#parent.touch();
            this.#router.navigate([created.id], { relativeTo: this.#route });
            setTimeout(() => this.#host.nativeElement.querySelector('list-group-item-contact.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
        });
}
