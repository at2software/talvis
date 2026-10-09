import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { User } from '@models/user/user.model';
import { HrDetailGuard } from '../hr-details.guard';
import { FormsModule } from '@angular/forms';
import { AutosaveDirective } from '@directives/autosave.directive';
import { PlzDbService } from '@app/customers/_shards/plz-db.service';
import { VcardComponent } from '@app/customers/_shards/vcard/vcard.component';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { GlobalService } from '@models/global.service';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';

@Component({
    selector: 'hr-contact',
    templateUrl: './hr-contact.component.html',
    imports: [FormsModule, VcardComponent, AutosaveDirective, NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrContactComponent {
    #parent = inject(HrDetailGuard);
    #plzDb = inject(PlzDbService);
    #global = inject(GlobalService);
    #confirmation = inject(ConfirmationService);

    readonly isAdmin = computed(() => this.#global.user?.hasRole('admin') ?? false);
    users = signal<User[]>([]);
    plzReady = signal(false);

    constructor() {
        effect(() => {
            this.users.set([this.#parent.object()]);
        });

        this.#plzDb.ensureLoaded().then(() => {
            this.plzReady.set(true);
        });
    }

    getWorkplaceCity = (user: User): string => {
        this.plzReady();
        if (!user.work_zip || user.work_zip.toString().length !== 5) return '';
        const [entry] = this.#plzDb.lookupSync(user.work_zip);
        return entry?.ort ?? '';
    };

    async disconnectM365(user: User) {
        const confirmed = await this.#confirmation.ask({
            title: $localize`:@@i18n.profile.m365Disconnect:disconnect Microsoft 365`,
            message: $localize`:@@i18n.hr.m365DisconnectConfirm:Disconnect this person's Microsoft 365 account? The TALVIS calendar and address book are removed from the mailbox.`,
        });
        if (confirmed) user.disconnectMicrosoft365().subscribe({ error: () => undefined });
    }
}
