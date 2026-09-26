import { Service } from '@angular/core';
import { TalvisHttpService } from '../http/http.talvis';
import { VacationGrant } from './vacation-grant.model';

@Service()
export class VacationGrantService extends TalvisHttpService<VacationGrant> {
    apiPath = 'vacation_grants';
    override readonly model = VacationGrant;
}
