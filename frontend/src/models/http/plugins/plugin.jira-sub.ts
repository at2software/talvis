import { catchError, forkJoin, Observable, of } from 'rxjs';
import { Task } from '@models/task/task.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { JiraPlugin, JiraProject, JiraUser } from './plugin.jira';

export class JiraSubPlugin extends JiraPlugin {
    override canCreateTasks = (): boolean => true;
    override indexTasks = (): Observable<Task[]> => this.searchAll(this.jql(false, false));
    protected override scope = (): string[] => [`project = "${this.projectKey}"`];

    protected override connectSub = (pluginLink?: PluginLink): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            this.projectKey = this._baseUrl.substring(this.site().length).replace(/^browse\//, '').replace(/\/.*$/, '');
            this.projectId = this.projectKey;
            forkJoin([
                this.get<JiraProject>(`project/${this.projectKey}`),
                this.aget<JiraUser>('user/assignable/search', { project: this.projectKey, maxResults: 1000 }).pipe(catchError(() => of([] as JiraUser[]))),
                this.get<{ values?: string[] }>('label', { maxResults: 1000 }).pipe(catchError(() => of({ values: [] as string[] }))),
            ]).subscribe({
                next: ([project, users, labels]) => {
                    this._name = project.name;
                    this._users = this.toPeople(users);
                    this._labels = (labels.values ?? []).map(this.toLabel);
                    if (pluginLink && pluginLink.name != this._name) {
                        pluginLink.update({ name: this._name }).subscribe();
                    }
                    resolve();
                },
                error: () => reject(),
            });
        });
}
