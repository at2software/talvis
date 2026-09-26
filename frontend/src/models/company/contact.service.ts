import { Service } from '@angular/core';
import { Contact } from '@models/company/contact.model';
import { TalvisHttpService } from '../http/http.talvis';

@Service()
export class ContactService extends TalvisHttpService<Contact> {
    apiPath = 'contacts';
    override readonly model = Contact;
    maintenanceMissingBirthdays = () => this.aget('contacts/maintenance/birthdays');
}
