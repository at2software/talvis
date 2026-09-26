import { Observable } from 'rxjs';
import { Project } from '@models/project/project.model';
import { Service } from '@angular/core';
import { Serializable } from '@models/_core/serializable';
import { Company } from '@models/company/company.model';
import { Assignee } from './assignee.model';
import { TalvisHttpService } from '../http/http.talvis';

@Service()
export class AssignmentService extends TalvisHttpService<Assignee> {
    override apiPath = 'assignees';
    override readonly model = Assignee;

    assigneesFor = (obj: Company | Project): Observable<Assignee[]> => {
        if (obj instanceof Company) return this.#company(obj!);
        return this.#project(obj!);
    };
    addToProject = (project: Project, data: { id: string; class: string }) => this.post(`projects/${project.id}/assignees`, data);
    addToCompany = (company: Company, data: { id: string; class: string }) => this.post(`companies/${company.id}/assignees`, data);
    setMainContact = (project: Project, assignmentId: string) => this.put(`projects/${project.id}/set-main-contact`, { assignment_id: assignmentId });

    #company = (c: Serializable) => this.aget('companies/' + c.id + '/assignees');
    #project = (c: Serializable) => this.aget('projects/' + c.id + '/assignees');
}
