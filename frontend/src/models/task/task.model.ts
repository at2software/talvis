import type { NxAction } from '@models/_core/nx.actions';
import { Serializable } from '@models/_core/serializable';
import { ITaskPlugin } from './task.plugin.interface';
import { HttpWrapper } from '../http/http.wrapper';
import { Assignee } from '@models/assignee/assignee.model';
import { Type } from '@models/_core/hydrate';
import { User } from '@models/user/user.model';
import { Project } from '@models/project/project.model';
import { Company } from '@models/company/company.model';
import { getTaskActions } from './task.actions';
import { Model, TypeFromClass } from '@constants/model/type-discriminators';

@Model('Task')
export class Task extends Serializable {
    static API_PATH = (): string => 'tasks';

    project_id: string = '';
    user_id: string = '';
    user_name: string = ''; // only from external
    assignment_id: string = '';
    task_id: string = '';
    name: string = '';
    description: string = '';
    duration: number = 0;
    state: number = 0;
    labels: string[] = [];
    href: string | undefined = undefined;
    project_url: string | undefined = undefined;
    project_name: string | undefined = undefined;
    link: string | undefined = undefined;

    @TypeFromClass() parent: User | Project | undefined;
    @Type(()=>Assignee) assignee!: Assignee;
    @Type(()=>Assignee) co_assignees: Assignee[] = [];
    @Type(()=>Project) linked_project?: Project;
    @Type(()=>Company) linked_company?: Company;

    declare httpService: ITaskPlugin & HttpWrapper;

    protected override buildActions(): NxAction[] { return getTaskActions(this) }

    getUser = () => this.httpService.getUserFor(this.user_id);
    web_url = () => `projects/${this.project_id}/tasks`;
    linkedObject = (): Project | Company | undefined => this.linked_project ?? this.linked_company;
    planningProjects = (fallback: Project[]): Project[] => {
        const customer = this.linked_project?.company ?? this.linked_company;
        const candidates = [this.linked_project, ...(customer?.projects_unfinished ?? []), ...fallback].filter((_): _ is Project => !!_);
        return candidates.filter((p, i) => candidates.findIndex((q) => String(q.id) === String(p.id)) === i);
    };
}
