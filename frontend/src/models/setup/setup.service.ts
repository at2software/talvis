import { Service } from '@angular/core';
import { Observable } from 'rxjs';
import { TalvisHttpService } from '@models/http/http.talvis';
import { Dictionary } from '@constants/constants';

export const ONBOARDING_HIDDEN = 'ONBOARDING_HIDDEN';

export type SetupStepKey = 'owner' | 'company' | 'invoicing' | 'working_time' | 'vacation' | 'products' | 'first_customer' | 'first_project' | 'first_invoice';

export interface SetupStep {
    key: SetupStepKey;
    done: boolean;
    required: boolean;
    missing: string[];
}

export interface SetupOwner {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
}

export interface SetupCompany {
    name: string;
    legal_form: string;
    owners: string;
    street: string;
    zip: string;
    city: string;
    country: string;
    url: string;
    email: string;
    phone: string;
    iban: string;
    bic: string;
    tax_id: string;
    vat_id: string;
}

export interface SetupInvoicing {
    INVOICE_DEFAULT_VAT: number;
    INVOICE_PAYMENT_DURATION: number;
    INVOICE_HOURLY_WAGE: number | null;
    INVOICE_NO_PREFIX: string | null;
    INVOICE_NO_DIGITS: number;
    INVOICE_NO_CURRENT: number;
    QUOTE_NO_PREFIX: string | null;
    QUOTE_NO_DIGITS: number;
    QUOTE_NO_CURRENT: number;
}

export interface SetupWorkingTime {
    hours: Dictionary<number>;
    work_zip: string;
    vacation_days: number;
}

@Service()
export class SetupService extends TalvisHttpService<never> {
    apiPath = 'setup';

    status = (): Observable<SetupStep[]> => this.get('setup/status', {}, Object);
    storeOwner = (owner: SetupOwner): Observable<Dictionary & { api_token: string }> => this.post('setup/owner', owner, Object);
    showCompany = (): Observable<SetupCompany> => this.get('setup/company', {}, Object);
    updateCompany = (company: SetupCompany): Observable<SetupCompany> => this.put('setup/company', company, Object);
    showInvoicing = (): Observable<SetupInvoicing> => this.get('setup/invoicing', {}, Object);
    updateInvoicing = (invoicing: SetupInvoicing): Observable<SetupInvoicing> => this.put('setup/invoicing', invoicing, Object);
    showWorkingTime = (): Observable<SetupWorkingTime> => this.get('setup/working-time', {}, Object);
    updateWorkingTime = (workingTime: SetupWorkingTime): Observable<SetupWorkingTime> => this.put('setup/working-time', workingTime, Object);
}

export const validationErrors = (err: unknown): Dictionary<string> => {
    const errors = (err as { error?: { errors?: Dictionary<string[]> } })?.error?.errors ?? {};
    return Object.fromEntries(Object.entries(errors).map(([key, messages]) => [key, messages[0]]));
};
