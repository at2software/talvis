import { catchError, forkJoin, Observable, of } from 'rxjs';
import { Dictionary } from '@constants/constants';
import { Task } from '@models/task/task.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { GitHubLabel, GitHubPlugin, GitHubRepo, GitHubUser } from './plugin.github';

export class GitHubSubPlugin extends GitHubPlugin {
    override canCreateTasks = (): boolean => true;
    override indexTasks = (): Observable<Task[]> => this.indexAll(false, 'all');
    protected override issuesQuery = (): [string, Dictionary] => [`repos/${this.repo}/issues`, {}];

    protected override connectSub = (pluginLink?: PluginLink): Promise<void> =>
        new Promise<void>((resolve, reject) => {
            this.repo = this._baseUrl.substring(this.web().length).replace(/^\/+|\/+$/g, '');
            this.projectId = this.repo;
            forkJoin([
                this.get<GitHubRepo>(`repos/${this.repo}`),
                this.aget<GitHubUser>(`repos/${this.repo}/assignees`, { per_page: 100 }).pipe(catchError(() => of([] as GitHubUser[]))),
                this.aget<GitHubLabel>(`repos/${this.repo}/labels`, { per_page: 100 }).pipe(catchError(() => of([] as GitHubLabel[]))),
            ]).subscribe({
                next: ([repo, users, labels]) => {
                    this._name = repo.full_name;
                    this._users = users.map(this.toUser);
                    this._labels = labels.map(this.toLabel);
                    if (pluginLink && pluginLink.name != this._name) {
                        pluginLink.update({ name: this._name }).subscribe();
                    }
                    resolve();
                },
                error: () => reject(),
            });
        });
}
