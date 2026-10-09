import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { Dictionary, typeahead } from '@constants/constants';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { SetupCompany, SetupService, validationErrors } from '@models/setup/setup.service';
import { GlobalService } from '@models/global.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-setup-company',
    templateUrl: './modal-setup-company.component.html',
    imports: [FormsModule, HotkeyDirective, SpinnerComponent],
})
export class ModalSetupCompanyComponent extends ModalBaseComponent<boolean> {
    static override modalOptions: NgbModalOptions = { size: 'lg' };

    readonly LEGAL_FORMS = ['e.K.', 'GbR', 'GmbH', 'UG (haftungsbeschränkt)', 'PartG', 'OHG', 'KG', 'AG'];

    #setup = inject(SetupService);
    #global = inject(GlobalService);

    company = signal<SetupCompany | undefined>(undefined);
    countries = signal<{ key: string; name: string }[]>([]);
    saving = signal(false);
    errors = signal<Dictionary<string>>({});

    init() {
        this.#setup.showCompany().subscribe((company) =>
            this.company.set({
                ...company,
                country: company.country || (this.#global.setting('SYS_COUNTRY') as string) || 'DE',
                owners: company.owners || (this.#global.user?.getName() ?? ''),
            }),
        );
        import('@constants/iso/iso3166').then((iso) => this.countries.set(typeahead(iso.COUNTRY_CODES, 'alpha-2', 'name')));
    }
    onSuccess = () => true;

    save() {
        const company = this.company();
        if (!company || this.saving()) return;
        this.saving.set(true);
        this.#setup.updateCompany(company).subscribe({
            next: () => this.accept(),
            error: (err) => {
                this.saving.set(false);
                this.errors.set(validationErrors(err));
            },
        });
    }
}
