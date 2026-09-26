import type { NxAction } from '@models/_core/nx.actions';
import { Contact } from './contact.model';
import { VcardClass } from '../vcard/vcard-class.model';
import { Project } from '../project/project.model';
import { Company } from './company.model';
import { Type } from '@models/_core/hydrate';
import { getCompanyContactActions } from './company-contact.actions';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { environment } from '@environments/environment';

@Model('CompanyContact')
export class CompanyContact extends VcardClass {
    static override API_PATH = (): string => 'company_contacts';

    override readonly getName = computed(() => { this.snapshot(); return this.contact?.getName() ?? ''; });
    override readonly getAvatar = computed(() => environment.envApi + `companies/${this.snapshot().company_id}/icon`);
    override get gender(): string { return this.contact?.gender ?? ''; }

    readonly isRetired = computed(() => this.snapshot().is_retired === true);

    protected override buildActions(): NxAction[] { return getCompanyContactActions(this) }

    company_id: string = '';
    contact_id: string = '';
    is_retired: boolean = false;
    is_favorite: boolean = false;
    is_invoicing_address: boolean = false;

    @Type(()=>Company) company!: Company;
    @Type(()=>Contact) contact!: Contact;
    @Type(()=>Project) projects!: Project;

    getPersonal = (): VcardClass | undefined => this.contact;

    frontendUrl = (): string => `/customers/${this.company_id}/contacts/${this.id}`;
}
