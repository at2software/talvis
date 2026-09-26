import { Service } from '@angular/core';
import { TalvisHttpService } from '@models/http/http.talvis';
import { LeadSource } from './lead-source.model';

@Service()
export class LeadSourceService extends TalvisHttpService<LeadSource> {
    public apiPath = 'lead_sources';
}
