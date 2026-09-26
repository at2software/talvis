import { ChangeDetectionStrategy, Component, computed, inject, input, TemplateRef } from '@angular/core';
import { CustomerDetailGuard } from '../../customers.details.guard';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { forkJoin } from 'rxjs';
import { Company } from '@models/company/company.model';

import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompanyLocaleSelectorComponent } from '../company-locale-selector/company-locale-selector.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'customer-payment-details',
    templateUrl: './customer-payment-details.component.html',
    imports: [NgbTooltipModule, NgTemplateOutlet, FormsModule, CompanyLocaleSelectorComponent],
})
export class CustomerPaymentDetailsComponent {
    company = input<Company>();
    additionalItems = input<TemplateRef<unknown>>();
    projectPaymentDuration = input<string>();
    onChangeProjectPaymentDuration = input<() => void>();
    onRemoveProjectPaymentDuration = input<() => void>();

    current = computed(() => this.company() ?? this.parent?.object());
    hasProjectPaymentDuration = computed(() => !!this.projectPaymentDuration());
    effectivePaymentDuration = computed(() => this.projectPaymentDuration() || this.current()?.getParam('INVOICE_PAYMENT_DURATION') || '14');
    hasDiscount = computed(() => parseFloat(this.current()?.getParam('INVOICE_DISCOUNT') ?? '0') > 0);
    hasCustomerPaymentDuration = computed(() => !this.projectPaymentDuration() && !!this.current()?.getParam('INVOICE_PAYMENT_DURATION'));

    parent = inject(CustomerDetailGuard, { optional: true });
    inputModal = inject(InputModalService);

    onLocaleChanged() {
        this.parent?.reload();
    }

    handlePaymentDurationClick() {
        const onChange = this.onChangeProjectPaymentDuration();
        if (onChange) {
            onChange();
        } else {
            this.onChangeParam('INVOICE_PAYMENT_DURATION');
        }
    }

    onChangeParam(param: string) {
        this.inputModal.open($localize`:@@i18n.customers.set_new_value:set new value`).then((r) => {
            if (r?.text) {
                this.current()!
                    .updateParam(param, { value: r.text })
                    .subscribe(() => this.parent?.reload());
            }
        });
    }

    async onChangeSepa() {
        const mandate = (await this.inputModal.open($localize`:@@i18n.customers.set_mandate_reference:set mandate reference`))?.text ?? undefined;
        const iban = (await this.inputModal.open($localize`:@@i18n.customers.set_iban:set IBAN`))?.text ?? undefined;
        forkJoin([this.current()!.updateParam('INVOICE_DD_MANDATE', { value: mandate }), this.current()!.updateParam('INVOICE_DD_IBAN', { value: iban })]).subscribe(() => this.parent?.reload());
    }

    removeDiscount() {
        this.current()!
            .updateParam('INVOICE_DISCOUNT', { value: null })
            .subscribe(() => this.parent?.reload());
    }

    removeSepa() {
        forkJoin([this.current()!.updateParam('INVOICE_DD_MANDATE', { value: null }), this.current()!.updateParam('INVOICE_DD_IBAN', { value: null })]).subscribe(() => this.parent?.reload());
    }

    removePaymentDuration() {
        this.current()!
            .updateParam('INVOICE_PAYMENT_DURATION', { value: null })
            .subscribe(() => this.parent?.reload());
    }

    removeVat() {
        this.current()!
            .update({ vat_id: null })
            .subscribe(() => this.parent?.reload());
    }

    onChangeEmail() {
        const hint = $localize`:@@i18n.customers.multiple_emails_hint:separate multiple recipients with a semicolon`;
        this.inputModal.open($localize`:@@i18n.customers.set_new_email:set new email`, false, hint, this.current()?.invoice_email ?? '').then((r) => {
            if (r?.text) {
                this.current()!
                    .update({ invoice_email: r.text })
                    .subscribe(() => this.parent?.reload());
            }
        });
    }

    onChangeVat() {
        this.inputModal.open($localize`:@@i18n.customers.set_new_vat_id:set new VAT ID`).then((r) => {
            this.current()!
                .update({ vat_id: r?.text ?? null })
                .subscribe(() => this.parent?.reload());
        });
    }
}
