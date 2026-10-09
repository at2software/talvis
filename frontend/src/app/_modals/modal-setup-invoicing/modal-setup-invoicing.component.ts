import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { Dictionary } from '@constants/constants';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { SetupInvoicing, SetupService, validationErrors } from '@models/setup/setup.service';
import { GlobalService } from '@models/global.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-setup-invoicing',
    templateUrl: './modal-setup-invoicing.component.html',
    imports: [FormsModule, HotkeyDirective, SpinnerComponent],
})
export class ModalSetupInvoicingComponent extends ModalBaseComponent<boolean> {
    static override modalOptions: NgbModalOptions = { size: 'lg' };

    readonly VAT_RATES = [19, 7, 0];
    readonly PAYMENT_DURATIONS = [7, 14, 30];

    #setup = inject(SetupService);

    readonly currency = (inject(GlobalService).setting('SYS_CURRENCY') as string | undefined) ?? 'EUR';

    invoicing = signal<SetupInvoicing | undefined>(undefined);
    saving = signal(false);
    errors = signal<Dictionary<string>>({});

    init() {
        const year = new Date().getFullYear();
        this.#setup.showInvoicing().subscribe((invoicing) =>
            this.invoicing.set({
                ...invoicing,
                INVOICE_NO_PREFIX: invoicing.INVOICE_NO_PREFIX ?? `RE-${year}-`,
                QUOTE_NO_PREFIX: invoicing.QUOTE_NO_PREFIX ?? `AN-${year}-`,
            }),
        );
    }
    onSuccess = () => true;

    preview = (prefix: string | null, digits: number, current: number) => (prefix ?? '') + String(current ?? 1).padStart(Number(digits) || 0, '0');

    save() {
        const invoicing = this.invoicing();
        if (!invoicing || this.saving()) return;
        this.saving.set(true);
        this.#setup.updateInvoicing(invoicing).subscribe({
            next: () => this.accept(),
            error: (err) => {
                this.saving.set(false);
                this.errors.set(validationErrors(err));
            },
        });
    }
}
