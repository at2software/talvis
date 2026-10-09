import { Service } from '@angular/core';
import { Company } from '@models/company/company.model';
import { CompanyContact } from '@models/company/company-contact.model';
import { PdfCreationType } from '@enums/PdfCreationType';
import { Observable, map, switchMap, tap } from 'rxjs';
import { TalvisHttpService, idOf } from '../http/http.talvis';
import { notifyHttpError } from '@models/http/file-download';
import { Connection } from './connection.model';
import { Dictionary } from '@constants/constants';
import { nx } from '@models/_core/nx-bridge';
import { CustomerLocationDto, MonthlyBiasDataDto } from '@models/_core/api-response';
import { Param } from '@models/param/param.model';

@Service()
export class CompanyService extends TalvisHttpService<Company> {
    apiPath = 'companies';
    indexPaginated = (filters?: Dictionary) => this.paginate(this.apiPath, filters);

    override readonly model = Company;

    indexSupport = (options: Dictionary = {}) => this.aget(`companies/support`, options);
    indexByChurnRisk = () => this.aget('companies/churn-risk');
    showForPath = (path: string) => this.show(path.split('/')[1]);
    showConnections = (_: Company | string | number) => this.aget(`companies/${idOf(_)}/connections`, {}, Connection);
    indexAllConnections = (): Observable<Connection[]> => this.aget(`connections`, {}, Connection);
    create = (name: string = 'New company') => this.post('companies', { name: name });
    createOwnCompany = (name: string): Observable<Company> =>
        this.create(name).pipe(
            switchMap((company: Company) => Param.write('params/ME_ID', company.id).pipe(map(() => company))),
            tap((company) => {
                nx().global.settings['ME_ID'] = company.id;
                nx().global.me_id = company.id;
            }),
        );
    createEmployee = (id: string, name?: string) => this.post(`companies/${id}/employees`, { name }, CompanyContact);
    promptAddEmployee = (company: Company, onCreated: (created: CompanyContact) => void) =>
        nx()
            .promptInput($localize`:@@i18n.contacts.contactPersonName:name of the contact person`)
            .confirmed(({ text }) =>
                text?.trim() &&
                this.createEmployee(company.id, text.trim()).subscribe((created) => {
                    company.employees.push(created);
                    onCreated(created);
                }),
            );
    updateGeneric = (id: string, api: string, data: object) => this.put(api + '/' + id, data);
    importImprint = (_: Company) => this.get(`companies/${_.id}/import_imprint`);
    getByPhone = (phone_number: string) => this.get(`companies/by-phone`, { phone_number: phone_number });
    getOrCreateDraft = (phone_number: string) => this.post(`companies/draft`, { phone_number });
    keepDraft = (_: Company) => this.put(`companies/${_.id}/keep`, {});
    discardDraft = (_: Company) => this.delete(`companies/${_.id}/draft`);

    makeInvoice(_: Company, success?: () => unknown, draft = false) {
        const params: Dictionary = draft ? { type: PdfCreationType.Create, draft: 1 } : { type: PdfCreationType.Create };
        const download = nx().global.user!.getFloatParam('INVOICE_DOWNLOAD', 1);
        const done = () => {
            if (!draft) nx().global.onInvoiceCreated.next();
            success?.();
        };
        if (draft || download === 1) {
            return this.getFile(`companies/${_.id}/invoice`, params, done);
        } else {
            return this.getBlob(`companies/${_.id}/invoice`, params).subscribe({ next: done, error: notifyHttpError });
        }
    }

    activateRepeatingItems = (companyId: string | number) => this.put(`companies/${companyId}/activate-repeating-items`, {});

    maintenanceCommercialRegister = () => this.aget('companies/maintenance/commercial-register');

    getRevenueStats = (c: Company) => this.aget(`companies/${c.id}/stats-revenue`, {}, Object);
    getProjectStats = (c: Company) => this.aget(`companies/${c.id}/stats-projects`, {}, Object);
    getPredictionAccuracy = (companyId: string) => this.aget<MonthlyBiasDataDto>(`companies/${companyId}/prediction-accuracy`);

    getWithCoordinates = () => this.aget<CustomerLocationDto>('companies/with-coordinates');
}
