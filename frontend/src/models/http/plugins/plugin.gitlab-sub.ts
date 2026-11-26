import { forkJoin, map, Observable } from 'rxjs';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { Label } from '@models/task/label.model';
import { User } from '@models/user/user.model';
import { GitLabPlugin } from './plugin.gitlab';
import { Task } from '@models/task/task.model';

export class GitLabSubPlugin extends GitLabPlugin {
    #pname: string = '';
    #users: User[] = [];
    #labels: Label[] = [];

    canCreateTasks = (): boolean => true;

    getHref = () => this._baseUrl;
    getName = () => (this._baseUrl ? this.#pname : this.#getRepositoryName());
    getUsers = () => this.#users;
    getUserFor = (userId: string) => this.#users.find((_) => _.id == userId);
    getLabels = () => this.#labels;
    getLabelFor = (name: string) => this.#labels.find((_) => _.name == name);
    indexMembers = (): Observable<(User | undefined)[]> => this.aget(`members/all`, {}, this.toUser);
    indexLabels = () => this.get('labels', {}, (_: any) => new Label(_.color, _.name, _.id));
    indexTasks = (): Observable<Task[]> => {
        const pageSize = 100;
        return this.fetchAllPages((page) => this.aget(`issues?scope=all&per_page=${pageSize}&page=${page}`, {}, this.toTask), pageSize);
    };
    indexOpenTasks = (): Observable<Task[]> => this.aget(`issues?assignee_id=${this.myUser().id}&state=opened`, {}, this.toTask);
    indexTasksPage = (page: number, pageSize: number, openOnly: boolean): Observable<{ tasks: Task[]; hasMore: boolean }> => {
        const state = openOnly ? 'opened' : 'all';
        return (this.aget(`issues?scope=all&state=${state}&per_page=${pageSize}&page=${page}`, {}, this.toTask)).pipe(map((tasks) => ({ tasks, hasMore: tasks.length >= pageSize })));
    };
    override searchIssues = (query: string): Observable<Task[]> => this.aget(`issues?scope=all&search=${encodeURIComponent(query)}&per_page=30`, {}, this.toTask);
    showProject = () => this.get('');
    toPluginLink = (id: string) => PluginLink.fromJson({ type: 'git', url: this.enc.value.url + 'projects/' + id });
    #getRepositoryName = () => this._baseUrl.replace(/(https?:\/\/)?([^/]*).*/, '$2');

    create = (_: Task) => this.post('issues', this.toGitIssue(_));
    close = (_: Task) => this.put('issues/' + _.id, { state_event: 'close' });
    reopen = (_: Task) => this.put('issues/' + _.id, { state_event: 'reopen' });
    destroy = (_: Task) => this.delete('issues/' + _.id);
    assign = (_: Task, user: User) => this.put('issues/' + _.id, { assignee_id: user.id });
    addLabel = (_: Task, label: string): Observable<Task> => this.put('issues/' + _.id, { add_labels: label }) as unknown as Observable<Task>;
    removeLabel = (_: Task, label: string): Observable<Task> => this.put('issues/' + _.id, { remove_labels: label }) as unknown as Observable<Task>;

    protected connectSub = (pluginLink?: PluginLink): Promise<void> =>
        new Promise<void>((resolve) => {
            forkJoin([this.indexMembers(), this.indexLabels(), this.showProject()]).subscribe((data: any) => {
                this.#users = data[0];
                this.#labels = data[1];
                this.#pname = data[2].name;
                if (pluginLink?.id && pluginLink.name != this.#pname) {
                    pluginLink.update({ name: this.#pname }).subscribe();
                }
                resolve();
            });
        });
}
