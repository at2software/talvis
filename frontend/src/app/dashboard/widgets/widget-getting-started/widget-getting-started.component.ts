import { ChangeDetectionStrategy, Component, computed, inject, input, signal, Type } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Dictionary } from '@constants/constants';
import * as Params from '@models/_core/params';
import { GlobalService } from '@models/global.service';
import { ONBOARDING_HIDDEN, SetupService, SetupStep, SetupStepKey } from '@models/setup/setup.service';
import { INxModal } from '@models/_core/nx.modal.interface';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalSetupCompanyComponent } from '@app/_modals/modal-setup-company/modal-setup-company.component';
import { ModalSetupInvoicingComponent } from '@app/_modals/modal-setup-invoicing/modal-setup-invoicing.component';
import { ModalSetupWorkingTimeComponent } from '@app/_modals/modal-setup-working-time/modal-setup-working-time.component';

const INVOICE_NUMBER_RANGE = $localize`:@@i18n.setup.missing.invoiceNumbers:invoice number range`;

interface StepInfo {
    title: string;
    description: string;
    modal?: Type<INxModal<boolean>>;
    link?: string;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-getting-started',
    templateUrl: './widget-getting-started.component.html',
    imports: [RouterLink],
})
export class WidgetGettingStartedComponent {
    #global = inject(GlobalService);
    #setup = inject(SetupService);
    #modal = inject(ModalBaseService);

    readonly STEPS: Record<SetupStepKey, StepInfo> = {
        owner: { title: $localize`:@@i18n.setup.step.owner:your own account`, description: $localize`:@@i18n.setup.step.ownerDescription:Work with a personal administrator account – the default account is deactivated.` },
        company: { title: $localize`:@@i18n.setup.step.company:your company`, description: $localize`:@@i18n.setup.step.companyDescription:Address, bank account and tax numbers – the sender of every invoice.`, modal: ModalSetupCompanyComponent },
        invoicing: { title: $localize`:@@i18n.setup.step.invoicing:invoices & taxes`, description: $localize`:@@i18n.setup.step.invoicingDescription:VAT rate, payment term, hourly rate and number ranges.`, modal: ModalSetupInvoicingComponent },
        working_time: { title: $localize`:@@i18n.setup.step.workingTime:working time`, description: $localize`:@@i18n.setup.step.workingTimeDescription:Weekly hours, working days and the postal code for public holidays.`, modal: ModalSetupWorkingTimeComponent },
        vacation: { title: $localize`:@@i18n.setup.step.vacation:vacation`, description: $localize`:@@i18n.setup.step.vacationDescription:Your annual vacation entitlement.`, modal: ModalSetupWorkingTimeComponent },
        products: { title: $localize`:@@i18n.setup.step.products:first services`, description: $localize`:@@i18n.setup.step.productsDescription:Create the services and products you sell.`, link: '/products' },
        first_customer: { title: $localize`:@@i18n.setup.step.firstCustomer:first customer`, description: $localize`:@@i18n.setup.step.firstCustomerDescription:Add a customer with address and invoice e-mail.`, link: '/customers' },
        first_project: { title: $localize`:@@i18n.setup.step.firstProject:first project`, description: $localize`:@@i18n.setup.step.firstProjectDescription:Start a project for a customer and write a quote.`, link: '/projects' },
        first_invoice: { title: $localize`:@@i18n.setup.step.firstInvoice:first invoice`, description: $localize`:@@i18n.setup.step.firstInvoiceDescription:Bill your time or services.`, link: '/financial' },
    };

    readonly MISSING: Dictionary<string> = {
        own_admin: $localize`:@@i18n.setup.missing.ownAdmin:own administrator account`,
        seed_admin_active: $localize`:@@i18n.setup.missing.seedAdminActive:default account still active – sign in with it once to hand over`,
        company: $localize`:@@i18n.setup.missing.company:company`,
        name: $localize`:@@i18n.setup.missing.name:name`,
        street: $localize`:@@i18n.setup.missing.street:street`,
        zip: $localize`:@@i18n.setup.missing.zip:postal code`,
        city: $localize`:@@i18n.setup.missing.city:city`,
        country: $localize`:@@i18n.setup.missing.country:country`,
        email: $localize`:@@i18n.setup.missing.email:e-mail`,
        iban: $localize`:@@i18n.setup.missing.iban:IBAN`,
        tax_id: $localize`:@@i18n.setup.missing.taxId:tax number or VAT ID`,
        INVOICE_DEFAULT_VAT: $localize`:@@i18n.setup.missing.vat:VAT rate`,
        INVOICE_PAYMENT_DURATION: $localize`:@@i18n.setup.missing.paymentDuration:payment term`,
        INVOICE_NO_PREFIX: INVOICE_NUMBER_RANGE,
        INVOICE_NO_DIGITS: INVOICE_NUMBER_RANGE,
        INVOICE_NO_CURRENT: INVOICE_NUMBER_RANGE,
        employment: $localize`:@@i18n.setup.missing.employment:working hours`,
        work_zip: $localize`:@@i18n.setup.missing.workZip:postal code for public holidays`,
        vacation_grant: $localize`:@@i18n.setup.missing.vacationGrant:vacation entitlement`,
    };

    readonly is_editing = input(false);

    readonly hidden = signal(!!Params.read(this.#global.user!, ONBOARDING_HIDDEN, 0));
    readonly steps = signal<SetupStep[]>([]);
    readonly showOptional = signal(false);

    readonly visible = computed(() => !this.hidden() && !!this.#global.user?.hasRole('admin') && this.steps().length > 0);
    readonly required = computed(() => this.steps().filter((_) => _.required));
    readonly optional = computed(() => this.steps().filter((_) => !_.required));
    readonly requiredDone = computed(() => this.required().filter((_) => _.done).length);
    readonly progress = computed(() => (this.required().length ? (100 * this.requiredDone()) / this.required().length : 0));

    constructor() {
        if (!this.hidden() && this.#global.user?.hasRole('admin')) this.reload();
    }

    reload = () => this.#setup.status().subscribe((steps) => this.steps.set(steps));

    missingLabels = (step: SetupStep) => [...new Set(step.missing.map((_) => this.MISSING[_] ?? _))].join(', ');

    open(step: SetupStep) {
        const modal = this.STEPS[step.key].modal;
        if (modal) this.#modal.open(modal).then((saved) => saved && this.reload());
    }

    hide() {
        const user = this.#global.user!;
        this.hidden.set(true);
        user.params = { ...user.params, [ONBOARDING_HIDDEN]: 1 };
        user.updateParam(ONBOARDING_HIDDEN, { value: 1 }).subscribe();
    }
}
