import { Service } from '@angular/core';
import { Dictionary } from '@constants/constants';
import { TalvisHttpService } from '../http/http.talvis';
import { DeletionLog } from './deletion-log.model';

@Service()
export class DeletionLogService extends TalvisHttpService<DeletionLog> {
    public apiPath = 'deletion_logs';
    override readonly model = DeletionLog;

    indexPaginated = (filters?: Dictionary) => this.paginate(this.apiPath, filters);
    indexModelTypes = () => this.aget<string>('deletion_logs/model-types');
    restore = (log: DeletionLog) => this.put(`deletion_logs/${log.id}/restore`, {}, DeletionLog);
}
