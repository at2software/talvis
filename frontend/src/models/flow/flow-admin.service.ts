import { Service } from '@angular/core';
import type { Observable } from 'rxjs';
import { TalvisHttpService } from '@models/http/http.talvis';
import { Serializable } from '@models/_core/serializable';
import type { Dictionary } from '@constants/constants';
import type { FlowAdminConfigDto, FlowAuditPageDto, FlowConfigResource } from '@models/_core/api-response';

@Service()
export class FlowAdminService extends TalvisHttpService<Serializable> {
    apiPath = 'flow/config';

    config = (): Observable<FlowAdminConfigDto> => this.get(this.apiPath, null, Object);
    store = (resource: FlowConfigResource, payload: Dictionary): Observable<Dictionary> => this.post(`${this.apiPath}/${resource}`, payload, Object);
    change = (resource: FlowConfigResource, id: number, payload: Dictionary): Observable<Dictionary> => this.put(`${this.apiPath}/${resource}/${id}`, payload, Object);
    remove = (resource: FlowConfigResource, id: number): Observable<unknown> => this.delete(`${this.apiPath}/${resource}/${id}`, null, Object);
    audit = (params: Dictionary): Observable<FlowAuditPageDto> => this.get('flow/audit', params, Object);
    auditSubjectTypes = (): Observable<string[]> => this.aget('flow/audit/subject-types', null, Object);
}
