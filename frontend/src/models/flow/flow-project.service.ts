import { Service } from '@angular/core';
import type { Observable } from 'rxjs';
import { TalvisHttpService } from '@models/http/http.talvis';
import type { Dictionary } from '@constants/constants';
import type { FlowJobTypeDto, FlowPhaseStatusDto, FlowRiskClassDto } from '@models/_core/api-response';
import { FlowJob } from './job.model';

@Service()
export class FlowProjectService extends TalvisHttpService<FlowJob> {
    apiPath = 'flow/projects';
    override readonly model = FlowJob;

    phase = (projectId: string): Observable<FlowPhaseStatusDto> => this.get(`${this.apiPath}/${projectId}/phase`, null, Object);
    jobs = (projectId: string) => this.aget(`${this.apiPath}/${projectId}/jobs`);
    storeJob = (projectId: string, type: string, input: Dictionary) => this.post(`${this.apiPath}/${projectId}/jobs`, { type, input });
    requestGate = (projectId: string, gateKey: string) => this.post(`${this.apiPath}/${projectId}/gates/${encodeURIComponent(gateKey)}/request`, {}, Object);
    setRiskClass = (projectId: string, riskClassId: number | null): Observable<FlowPhaseStatusDto> => this.put(`${this.apiPath}/${projectId}/risk-class`, { flow_risk_class_id: riskClassId }, Object);
    jobTypes = (): Observable<FlowJobTypeDto[]> => this.aget('flow/job-types', null, Object);
    riskClasses = (): Observable<FlowRiskClassDto[]> => this.aget('flow/risk-classes', null, Object);
}
