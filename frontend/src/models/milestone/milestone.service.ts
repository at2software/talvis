import { Service } from '@angular/core';
import { Observable } from 'rxjs';
import { TalvisHttpService } from '../http/http.talvis';
import { Milestone } from './milestone.model';
import { MilestoneData, MilestonesGroup } from './milestone-group.model';
import { Project } from '@models/project/project.model';
import { Dictionary } from '@constants/constants';
import { mapVar, serialize } from '@constants/rxjs/rxjs-operators';

export type PmMilestones = Dictionary & {
    milestones: MilestonesGroup[];
    projectsNoCoverage: Project[];
};

@Service()
export class MilestoneService extends TalvisHttpService<Milestone> {
    public apiPath = 'milestones';
    override readonly model = Milestone;

    indexUserMilestones = (userId: string) => this.aget(`users/${userId}/milestones`, {}, MilestonesGroup);
    indexPmMilestones = (userId: string): Observable<PmMilestones> =>
        this.get<PmMilestones>(`users/${userId}/pm-milestones`).pipe(
            serialize('milestones', MilestonesGroup),
            mapVar(['company_name', 'estimated_hours', 'milestone_count'], 'projectsNoCoverage'),
            serialize('projectsNoCoverage', Project),
        );

    indexOverview = () => this.get('milestones/overview', {}, MilestoneData);

    linkInvoiceItem = (milestoneId: string, invoiceItemId: string): Observable<unknown> => {
        return this.post(`milestones/${milestoneId}/invoice-items/${invoiceItemId}`, {});
    };

    addDependency = (milestoneId: number, dependsOnId: number): Observable<unknown> => {
        return this.post(`milestones/${milestoneId}/dependencies`, { depends_on: dependsOnId });
    };

    removeDependency = (milestoneId: number, dependsOnId: number): Observable<unknown> => {
        return this.delete(`milestones/${milestoneId}/dependencies`, { depends_on: dependsOnId });
    };

    removeDependencies = (milestoneId: number, dependsOnIds: number[]): Observable<unknown> => {
        return this.post(`milestones/${milestoneId}/dependencies/bulk/delete`, { depends_on_ids: dependsOnIds });
    };

    reorder = (milestones: { id: number; position: number }[]): Observable<unknown> => {
        return this.put(`milestones/reorder`, { milestones });
    };
}
