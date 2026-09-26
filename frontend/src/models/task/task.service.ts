import { Dictionary } from '@constants/constants';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { ITaskPlugin } from './task.plugin.interface';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { User } from '@models/user/user.model';
import { Assignee } from '@models/assignee/assignee.model';
import { Label } from './label.model';
import { Task } from './task.model';
import { nx } from '@models/_core/nx-bridge';
import { Observable, of } from 'rxjs';
import { inject, Service } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@environments/environment';

@Service()
export class TaskService extends PluginInstance implements ITaskPlugin {
    ITaskPluginProperty!: boolean;
    tasks: Task[] = [];
    needsHttpInterceptor: boolean = false;
    _http = inject(HttpClient);

    toPluginLink!: (id: string) => PluginLink;
    getHref!: () => string;
    addLabel!: (task: Task, _: string) => Observable<Task>;
    removeLabel!: (task: Task, _: string) => Observable<Task>;
    getLabelFor!: (name: string) => Label | undefined;

    getVcardAttributeName = () => 'X-NEXUS-TASK';
    isUserInInstance = (): boolean => false;
    getProfileUrl = (): string => '';
    getUserSelectionModalPath = () => '';
    getInterfacePropertyName = () => 'ITaskPluginProperty';
    getPluginTypeName = () => 'talvis';

    getActivityComments = (_projectId: string = '', _maxInitialItems: number = 150, _resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<never[]> => of([]);
    baseUrl = (): string => environment.envApi;
    canCreateTasks = (): boolean => true;
    myUser = () => nx().global.user;
    indexTasks = (): Observable<Task[]> => this.aget('tasks', {}, this.#toTask);
    getUsers = () => nx().global.team;
    getUserFor = (userId: string) => this.getUsers().find((_) => _.id === userId);
    getLabels = () => [];
    create = (_: Task) => _.store();
    close = (_: Task) => this.put(`tasks/${_.id}`, { state: 1 });
    reopen = (_: Task) => this.put(`tasks/${_.id}`, { state: 0 });
    destroy = (_: Task) => this.delete(`tasks/${_.id}`);
    assign = (_: Task, user: User) => this.put(`tasks/${_.id}`, { assignment_id: user.id });
    addCoAssignee = (_: Task, user: User) => this.post(`tasks/${_.id}/co-assignees`, { user_id: user.id }, (json) => Assignee.fromJson(json));
    removeCoAssignee = (_: Task, assignmentId: string) => this.delete(`tasks/${_.id}/co-assignees/${assignmentId}`);
    icon = () => 'nexus';
    getName = () => 'TALVIS';

    load = () => {
        this.init.next();
        return this;
    };

    open = (_: Task) => {
        // No-op
    };

    canManageProjectMembers = (): boolean => false;
    canAdminister = (): boolean => false;
    fetchIssue = (): Observable<{ href: string; state: number } | undefined> => of(undefined);
    indexTasksPage = (): Observable<{ tasks: Task[]; hasMore: boolean }> => of({ tasks: [], hasMore: false });

    protected connect = (): Promise<void> => Promise.resolve();
    protected connectSub = (): Promise<void> => Promise.resolve();

    #toTask = (payload: unknown): Task => {
        const newTask = Task.fromJson(payload as Dictionary);
        newTask.var.user = this.getUserFor(newTask.assignee?.id);
        newTask.var.compact = newTask.state == 1;
        newTask.httpService = this;
        return newTask;
    };
}
