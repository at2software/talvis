import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { PluginInstance } from './plugin.instance';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Task } from '@models/task/task.model';
import { Label } from '@models/task/label.model';
import { User } from '@models/user/user.model';
import { environment } from '@environments/environment';
import { Color } from '@constants/Color';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { Dictionary } from '@constants/constants';
import { Deserializer } from '../http.wrapper';

export const MantisAccess = { VIEWER: 10, REPORTER: 25, UPDATER: 40, DEVELOPER: 55, MANAGER: 70, ADMINISTRATOR: 90 } as const;
type MantisAccessLevel = number | { id?: number; name?: string };

export interface MantisProject extends Dictionary { id: string; name: string; description?: string; enabled?: boolean; access_level?: MantisAccessLevel; }
interface MantisIssue extends Dictionary { id: number; summary: string; description?: string; handler?: { id: number; name: string }; reporter?: { id?: number; name?: string; email?: string }; status?: { name: string }; target_version?: { id: number; name: string }; project: MantisProject; created_at?: string; }
export interface MantisUser extends Dictionary { id: number; name: string; email?: string; access_level?: MantisAccessLevel; projects?: MantisProject[]; }
interface MantisLabel extends Dictionary { id: number; name: string; color?: string; }

export class MantisPlugin extends PluginInstance implements ITaskPlugin {
    ITaskPluginProperty!: boolean;
    _myUser!: User;
    _name: string = '';
    _users: User[] = [];
    _labels: Label[] = [];
    _accessLevel: number = 0;
    projects: MantisProject[] = [];
    tasks: Task[] = [];
    categories: { id: number; name: string; project: MantisProject; status: string }[] = [];
    versions: { description: string; id: number; name: string; obsolete: boolean; released: boolean; timestamp: string }[] = [];

    index!: () => Observable<Task[]>;

    myUser = () => (this.getRootInstance() as MantisPlugin)._myUser;
    baseUrl = () => environment.envApi + 'cors';

    get = <T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => super.post<T>('', this.#payload(url, 'get', params), ...args);
     
    agetBody = <T = unknown>(url: string, params?: Dictionary, ...args: Deserializer<T[]>[]): Observable<T[]> =>
        super.post<T[]>('', this.#payload(url, 'get', params), ...args);
    delete = <T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => super.post<T>('', this.#payload(url, 'delete', params), ...args);
    put = <T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => super.post<T>('', this.#payload(url, 'put', params), ...args);
    post = <T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => super.post<T>('', this.#payload(url, 'post', params), ...args);
    patch = <T=unknown>(url: string, params?: Dictionary, ...args: Deserializer<T>[]) => super.post<T>('', this.#payload(url, 'patch', params), ...args);

    icon = () => 'mantis';
    getHref = () => this._baseUrl;
    getName = () => this._name;
    getUsers = () => this._users;
    getUserFor = (userId: string) => this._users.find((_) => _.id == userId);
    getLabels = () => this._labels;
    getLabelFor = (name: string) => this._labels.find((_) => _.name == name);

    #normalizeAccess = (level?: MantisAccessLevel): number => (typeof level === 'number' ? level : (level?.id ?? 0));
    accessLevelFor = (projectId: string): number => {
        const root = this.getRootInstance() as MantisPlugin;
        const project = root.projects.find((_) => String(_.id) === String(projectId));
        return Math.max(this.#normalizeAccess(project?.access_level), root._accessLevel);
    };
    canManageProjectMembers = (projectId: string): boolean => this.accessLevelFor(projectId) >= MantisAccess.MANAGER;
    canAdminister = (): boolean => (this.getRootInstance() as MantisPlugin)._accessLevel >= MantisAccess.ADMINISTRATOR;

    fetchIssue = (issueId: string): Observable<{ href: string; state: number } | undefined> =>
        this.get<{ issues?: MantisIssue[] }>('issues/' + issueId).pipe(
            map((res) => {
                const issue = res?.issues?.[0];
                return issue ? { href: this.enc.value.url + 'view.php?id=' + issueId, state: this.toState(issue.status) } : undefined;
            }),
            catchError(() => of(undefined)),
        );

    getVcardAttributeName = () => 'X-NEXUS-MANTISBT';
    isUserInInstance = (userId: string): boolean => this._users.some((_) => String(_.id) === String(userId));
    getProfileUrl = (userId: string): string => {
        const mantisUrl = this.enc.value.url.replace(/\/$/, '');
        return `${mantisUrl}/manage_user_edit_page.php?user_id=${userId}`;
    };
    getUserSelectionModalPath = () => '../../app/_modals/mantis-user-selection/mantis-user-selection.component';
    getInterfacePropertyName = () => 'ITaskPluginProperty';
    getPluginTypeName = () => 'mantisbt';
    indexTasks = (filterId?: string): Observable<Task[]> => {
        const configuredFilterId = filterId || this.enc?.value?.filterId;
        const filterParam = configuredFilterId ? `filter_id=${configuredFilterId}` : 'filter_id=assigned';
        const pageSize = 100;
        return this.fetchAllPages((page) => this.agetBody(`issues?${filterParam}&page_size=${pageSize}&page=${page}`, {}, this.toTask), pageSize);
    };
    indexTasksPage = (page: number, pageSize: number): Observable<{ tasks: Task[]; hasMore: boolean }> => {
        const configuredFilterId = this.enc?.value?.filterId;
        const filterParam = configuredFilterId ? `filter_id=${configuredFilterId}&` : '';
        return (this.agetBody(`issues?${filterParam}page_size=${pageSize}&page=${page}`, {}, this.toTask)).pipe(map((tasks) => ({ tasks, hasMore: tasks.length >= pageSize })));
    };
    searchIssues = (query: string): Observable<Task[]> =>
        /^\d+$/.test(query.trim()) ? (this.agetBody(`issues/${query.trim()}`, {}, this.toTask)).pipe(catchError(() => of([]))) : of([]);
    indexMembers = (): Observable<MantisUser[]> => {
        if (this.projects.length === 0) return of([]);
        return forkJoin(
            this.projects.map((p) =>
                this.get(`projects/${p.id}/users`).pipe(
                    map((data) => (data as { users?: MantisUser[] }).users ?? []),
                    catchError(() => of([] as MantisUser[])),
                ),
            ),
        ).pipe(map((perProject) => Array.from(new Map(perProject.flat().map((u) => [u.id, u])).values())));
    };
    indexLabels = (): Observable<unknown> => of([]);
    indexUsers = (): Observable<MantisUser[]> => of([]);
    showProject = (): Observable<unknown> => of();
    toPluginLink = (id: string) => PluginLink.fromJson({ type: 'mantis', name: this.projects.find((_) => String(_.id) === String(id))?.name ?? '', url: this.enc.value.url + 'projects/' + id + '/' });

    create = (_: Task) => this.post('issues', this.toMantisIssue(_));
    close = (_: Task) => this.patch('issues/' + _.id, { status: { name: 'resolved' } });
    reopen = (_: Task) => this.patch('issues/' + _.id, { status: { name: 'new' } });
    destroy = (_: Task) => this.delete('issues/' + _.id);
    assign = (_: Task) => this.patch(`issues/${_.id}`, { handler: { name: this.myUser().getName() }, status: { name: 'assigned' } });
    addLabel = (_: Task, label: string): Observable<Task> => this.patch(`issues/${_.id}`, { target_version: { name: label } }) as unknown as Observable<Task>;
    removeLabel = () => of(Task.fromJson());

    toState = (status: { name: string } | undefined) => {
        if (!status || !('name' in status)) return 0;
        return status.name == 'resolved' || status.name == 'closed' ? 1 : 0;
    };

    toLabel = (_: MantisLabel) => new Label(Color.uniqueColorFromString('' + _.id), _.name, String(_.id));

    toTask = (data: unknown): Task[] => {
        const { issues } = data as { issues: MantisIssue[] };
        return issues.map((_: MantisIssue) => {
            const t = Task.fromJson({
                id: '' + _.id,
                name: `[#${_.id}] ${_.summary}`,
                user_id: _.handler?.id,
                user_name: _.handler?.name,
                description: _.description || '',
                state: 'status' in _ ? this.toState(_.status) : 0,
                href: this.enc.value.url + 'view.php?id=' + _.id,
                labels: _.target_version ? [_.target_version.name] : [],
                orig: _,
                project_url: `${this.enc.value.url}projects/${_.project.id}/`,
                project_name: _.project.name,
            });
            t.var.user = this.getUserFor(String(_.handler?.id ?? ''));
            t.var.target_version_id = _.target_version?.id;
            t.var.compact = t.state == 1;
            t.httpService = this;
            return t;
        });
    };

    toMantisIssue = (_: Task) => ({
        summary: _.name,
        description: _.description || _.name,
        category: { name: this.categories[0]?.name ?? 'General' },
        status: { name: 'new' },
        project: { id: _.project_id },
    });

    toUser = (data: MantisUser) => {
        const u = User.fromJson({ id: data.id, name: data.name });
        u.var.data = data;
        u.httpService = this;
        u.avatar = () => '';
        return u;
    };

    open = (_: Task) => window.open(this.enc.value.url + `view.php?id=${_.id}`, '_blank');

    getActivityComments(projectId: string, maxInitialItems: number = 150, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]> {
        const pageSize = 50;
        const maxPages = Math.ceil(maxInitialItems / pageSize);
        const pageRequests: Observable<Dictionary[]>[] = [];

        for (let page = 1; page <= maxPages; page++) {
            pageRequests.push(this.#getActivityCommentsPage(projectId, page, pageSize, resolveUser));
        }
        return forkJoin(pageRequests).pipe(map((pagesResults: Dictionary[][]) => pagesResults.flat().slice(0, maxInitialItems)));
    }

    protected connect = () =>
        new Promise<void>((resolve, reject) => {
            this.get('users/me')
                .pipe(
                    map((me) => {
                        const meUser = me as MantisUser;
                        this._name = this._baseUrl.replace(/(https?:\/\/)?([^/]*).*/, '$2');
                        this._myUser = this.toUser(meUser);
                        this._accessLevel = this.#normalizeAccess(meUser.access_level);
                        this.projects = meUser.projects ?? [];
                        return meUser;
                    }),
                    switchMap(() => this.indexUsers()),
                    catchError(() => {
                        reject();
                        return of([] as MantisUser[]);
                    }),
                )
                .subscribe((members) => {
                    this._users = members.map((u) => this.toUser(u));
                    resolve();
                });
        });

    #payload = (url: string, method: string, params: Dictionary = {}) =>
        Object.assign(
            {
                url: `${this.enc.value.url.replace(/\/$/, '')}/api/rest/${url}`,
                method,
                headers: ['Authorization: ' + this.enc.value.token, 'Content-Type: application/json'],
            },
            { data: params },
        );

    #getActivityCommentsPage(projectId: string, page: number, pageSize: number, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]> {
        const queryParams = `project_id=${projectId}&page=${page}&page_size=${pageSize}`;
        return this.get<{ issues?: MantisIssue[] }>(`issues?${queryParams}`).pipe(
            map((resp) => {
                const tasks = resp?.issues || [];
                return tasks
                    .filter((task) => task)
                    .map((issue) => {
                        const isClosed = issue.status?.name === 'resolved' || issue.status?.name === 'closed';
                        const stateText = isClosed ? 'closed' : 'open';
                        const authorName = issue.reporter?.name || 'Unknown';
                        const authorEmail = issue.reporter?.email;
                        const authorMantisId = issue.reporter?.id?.toString();
                        const issueId = issue.id;
                        const href = this.enc.value.url + 'view.php?id=' + issueId;

                        const resolvedUser = resolveUser?.(authorEmail, authorMantisId, authorName, 'X-NEXUS-MANTISBT') as (Dictionary<unknown> & { id?: string; getAvatar?: () => string }) | undefined;

                        let description = '';
                        if (!resolvedUser) {
                            description += `${authorName} `;
                        }
                        description += `<n>mantis</n> <a href="${href}" target="_blank" class="text-primary">#${issueId}</a> [${stateText}]`;
                        return {
                            text: description,
                            created_at: issue.created_at,
                            user: resolvedUser || { name: authorName },
                            user_id: resolvedUser?.id,
                            is_mini: true,
                            icon: resolvedUser?.getAvatar?.(),
                            var: { source: 'mantisbt', ...(resolvedUser ? {} : { nicon: 'mantis' }) },
                            itemCount: tasks.length,
                            pageSize: pageSize,
                        };
                    });
            }),
        );
    }
}
