import { Service } from '@angular/core';
import { Sentinel } from '@models/sentinel/sentinel.model';
import { TalvisHttpService } from '../http/http.talvis';
import { SentinelActiveGroupDto } from '@models/_core/api-response';

@Service()
export class SentinelService extends TalvisHttpService<Sentinel> {
    public apiPath = 'sentinels';
    override readonly model = Sentinel;

    indexActive = () => this.aget<SentinelActiveGroupDto>('sentinels/active');
}
