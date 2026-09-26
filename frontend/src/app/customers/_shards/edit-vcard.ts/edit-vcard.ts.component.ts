import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, model } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { CompanyContact } from '@models/company/company-contact.model';
import { VcardComponent } from '../vcard/vcard.component';
import { CustomerDetailGuard } from '@app/customers/customers.details.guard';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'edit-vcard',
    templateUrl: './edit-vcard.ts.component.html',
    imports: [VcardComponent],
})
export class EditVcardTsComponent {
    card = model.required<CompanyContact>();

    fnRow = computed(() => this.card().contact.card()?.rows.findIndex((_) => _.key == 'FN'));
    nRow = computed(() => this.card().contact.card()?.rows.findIndex((_) => _.key == 'N'));

    #router = inject(ActivatedRoute);
    #parent = inject(CustomerDetailGuard);

    company = this.#parent.object;
    #destroyRef = inject(DestroyRef);

    constructor() {
        const object = this.#parent.object();
        this.#router.params.pipe(takeUntilDestroyed()).subscribe((params) => {
            const card = object.employees.find((_) => _.id == params['cid']);
            if (card) {
                this.card.set(card);
                setTimeout(() => {
                    object.var.selectedEmployee = card;
                    this.#parent.touch();
                });
            }
        });
        this.#destroyRef.onDestroy(() => {
            if (this.#parent.object() !== object) return;
            object.var.selectedEmployee = undefined;
            this.#parent.touch();
        });
    }

    save() {
        const card = this.card();
        card.update({ vcard: card.__vcardExchangeString }).subscribe();
        if (card instanceof CompanyContact) {
            card.contact.update({ vcard: card.contact.__vcardExchangeString }).subscribe();
        }
    }

    updateVcard() {
        const contact = this.card().contact;
        contact.update({ vcard: contact.card()?.toString() }).subscribe();
    }
}
