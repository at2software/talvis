import { catchError, forkJoin, map, Observable, of, throwError } from 'rxjs';
import { Dictionary } from '@constants/constants';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Task } from '@models/task/task.model';
import { Label } from '@models/task/label.model';
import { User } from '@models/user/user.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { ILinkableProjects, LinkableProject } from './plugin.instance';
import { ActivityUserResolver, ProxiedPluginInstance, rawProxyError } from './proxied.plugin.instance';

export interface GitHubUser extends Dictionary { login: string; id: number; name?: string | null; email?: string | null; avatar_url?: string; site_admin?: boolean; }
export interface GitHubLabel extends Dictionary { id: number; name: string; color: string; }
export interface GitHubRepo extends Dictionary { id: number; full_name: string; html_url: string; description?: string | null; }
interface GitHubIssue extends Dictionary { number: number; title: string; body?: string | null; state: string; html_url: string; repository_url: string; assignee?: GitHubUser | null; assignees?: GitHubUser[]; user?: GitHubUser | null; labels?: (GitHubLabel | string)[]; pull_request?: unknown; created_at?: string; }

const PAGE_SIZE = 100;
const REPO_PAGES = 3;
const ACTIVITY_PAGE_SIZE = 50;
const GITHUB_COM = /^https?:\/\/(www\.)?github\.com\/$/i;

const isIssue = (_: GitHubIssue): boolean => !_.pull_request;

export class GitHubPlugin extends ProxiedPluginInstance implements ITaskPlugin, ILinkableProjects {
    override newPluginText: string = 'owner/repo:';

    ITaskPluginProperty: boolean = true;
    tasks: Task[] = [];
    repo: string = '';

    _myUser!: User;
    _isAdmin: boolean = false;
    protected _name: string = '';
    protected _users: User[] = [];
    protected _labels: Label[] = [];

    myUser = () => (this.getRootInstance() as GitHubPlugin)._myUser;
    icon = () => 'github';
    getHref = () => this._baseUrl;
    getName = () => this._name;
    getUsers = () => this._users;
    getUserFor = (userId: string) => this._users.find((_) => _.id == userId);
    getLabels = () => this._labels;
    getLabelFor = (name: string) => this._labels.find((_) => _.name == name);

    getVcardAttributeName = () => 'X-NEXUS-GITHUB';
    isUserInInstance = (login: string): boolean => this._users.some((_) => String(_.id).toLowerCase() === String(login).toLowerCase());
    getProfileUrl = (login: string): string => `${this.web()}${login}`;
    getUserSelectionModalPath = () => '../../app/_modals/tracker-user-selection/tracker-user-selection.component';
    getInterfacePropertyName = () => 'ITaskPluginProperty';
    getPluginTypeName = () => 'github';

    canManageProjectMembers = (): boolean => false;
    canAdminister = (): boolean => (this.getRootInstance() as GitHubPlugin)._isAdmin;

    web = (): string => this.enc.value.url.replace(/\/?$/, '/');
    apiBase = (): string => (GITHUB_COM.test(this.web()) ? 'https://api.github.com/' : `${this.web()}api/v3/`);
    toPluginLink = (fullName: string) => {
        const repo = fullName.trim().replace(/^\/+|\/+$/g, '');
        return PluginLink.fromJson({ type: 'github', name: repo, url: this.web() + repo });
    };

    indexLinkableProjects = (): Observable<LinkableProject[]> =>
        forkJoin(Array.from({ length: REPO_PAGES }, (_, i) => this.aget<GitHubRepo>('user/repos', { per_page: PAGE_SIZE, sort: 'updated', page: i + 1 }).pipe(catchError(() => of([] as GitHubRepo[]))))).pipe(
            map((pages) => pages.flat().map((_) => ({ id: _.full_name, name: _.full_name, description: _.description ?? undefined }))),
        );

    indexTasks = (): Observable<Task[]> => this.indexAll(true, 'open');
    indexTasksPage = (page: number, pageSize: number, openOnly: boolean, assignedOnly: boolean = true): Observable<{ tasks: Task[]; hasMore: boolean }> => {
        const [path, query] = this.issuesQuery(assignedOnly && this.isRootInstance());
        return this.aget<GitHubIssue>(path, { ...query, state: openOnly ? 'open' : 'all', per_page: pageSize, page }).pipe(map((issues) => ({ tasks: issues.filter(isIssue).map(this.toTask), hasMore: issues.length >= pageSize })));
    };
    searchIssues = (query: string): Observable<Task[]> => {
        const term = query.trim().replace(/^#/, '');
        if (!term) return of([]);
        if (/^\d+$/.test(term) && this.repo) {
            return this.get<GitHubIssue>(`repos/${this.repo}/issues/${term}`).pipe(
                map((issue) => (issue?.number && isIssue(issue) ? [this.toTask(issue)] : [])),
                catchError(() => of([])),
            );
        }
        const qualifier = this.repo ? `repo:${this.repo}` : 'assignee:@me';
        return this.get<{ items?: GitHubIssue[] }>('search/issues', { q: `${term} is:issue ${qualifier}`, per_page: 30 }).pipe(
            map((res) => (res.items ?? []).map(this.toTask)),
            catchError(() => of([])),
        );
    };

    fetchIssue = (issueNumber: string): Observable<{ href: string; state: number } | undefined> =>
        this.get<GitHubIssue>(`repos/${this.repo}/issues/${issueNumber}`).pipe(
            map((issue) => (issue?.html_url ? { href: issue.html_url, state: issue.state === 'closed' ? 1 : 0 } : undefined)),
            catchError(() => of(undefined)),
        );

    create = (_: Task): Observable<Task> => this.post<Task>(`repos/${this.#repoOf(_)}/issues`, { title: _.name, ...(_.description ? { body: _.description } : {}) }, this.toTask);
    close = (_: Task) => this.patch(this.#issuePath(_), { state: 'closed' });
    reopen = (_: Task) => this.patch(this.#issuePath(_), { state: 'open' });
    destroy = (_: Task): Observable<unknown> => throwError(() => new Error(`GitHub issues cannot be deleted via REST (${this.#repoOf(_)}#${_.id})`));
    assign = (_: Task, user: User) => this.post(`${this.#issuePath(_)}/assignees`, { assignees: [user.id] });
    addLabel = (_: Task, label: string): Observable<Task> => this.post(`${this.#issuePath(_)}/labels`, { labels: [label] }) as unknown as Observable<Task>;
    removeLabel = (_: Task, label: string): Observable<Task> => this.delete(`${this.#issuePath(_)}/labels/${encodeURIComponent(label)}`) as unknown as Observable<Task>;

    open = (_: Task) => window.open(_.href, '_blank');

    getActivityComments(_projectId: string, maxInitialItems: number = 150, resolveUser?: ActivityUserResolver): Observable<Dictionary[]> {
        if (!this.repo) return of([]);
        const pages = Math.ceil(maxInitialItems / ACTIVITY_PAGE_SIZE);
        return forkJoin(
            Array.from({ length: pages }, (_, i) =>
                this.aget<GitHubIssue>(`repos/${this.repo}/issues`, { state: 'all', sort: 'created', direction: 'desc', per_page: ACTIVITY_PAGE_SIZE, page: i + 1 }).pipe(catchError(() => of([] as GitHubIssue[]))),
            ),
        ).pipe(
            map((results) =>
                results
                    .flat()
                    .filter(isIssue)
                    .slice(0, maxInitialItems)
                    .map((issue) =>
                        this.activityEntry(
                            { author: { email: issue.user?.email ?? undefined, username: issue.user?.login, name: issue.user?.login }, href: issue.html_url, label: `#${issue.number}`, closed: issue.state === 'closed', created_at: issue.created_at },
                            resolveUser,
                        ),
                    ),
            ),
        );
    }

    protected issuesQuery = (assigned: boolean): [string, Dictionary] => ['issues', { filter: assigned ? 'assigned' : 'all' }];
    protected indexAll = (assigned: boolean, state: 'open' | 'all'): Observable<Task[]> => {
        const [path, query] = this.issuesQuery(assigned);
        return this.fetchAllPages((page) => this.aget<GitHubIssue>(path, { ...query, state, per_page: PAGE_SIZE, page }), PAGE_SIZE).pipe(map((issues) => issues.filter(isIssue).map(this.toTask)));
    };

    protected toLabel = (_: GitHubLabel) => new Label('#' + _.color, _.name, String(_.id));
    protected toTask = (raw: unknown): Task => {
        const issue = raw as GitHubIssue;
        const repo = issue.repository_url.replace(/^.*\/repos\//, '');
        const me = this.myUser()?.id;
        const assignee = issue.assignees?.find((_) => _.login === me) ?? issue.assignee;
        const t = Task.fromJson({
            id: String(issue.number),
            name: `[#${issue.number}] ${issue.title}`,
            user_id: assignee?.login,
            user_name: assignee?.login,
            description: issue.body ?? '',
            state: issue.state === 'closed' ? 1 : 0,
            href: issue.html_url,
            labels: (issue.labels ?? []).map((_) => (typeof _ === 'string' ? _ : _.name)),
            project_url: issue.html_url.replace(/\/issues\/\d+$/, ''),
            project_name: repo,
            orig: issue,
        });
        t.var.repo = repo;
        t.var.user = this.getUserFor(assignee?.login ?? '');
        t.var.compact = t.state == 1;
        t.httpService = this;
        return t;
    };
    protected toUser = (raw: unknown): User => {
        const data = raw as GitHubUser;
        const u = User.fromJson({ id: data.login, name: data.name || data.login });
        u.var.data = { ...data, username: data.login, email: data.email ?? undefined };
        u.var.avatar_url = data.avatar_url;
        u.httpService = this;
        u.avatar = () => u.var.avatar_url;
        return u;
    };

    protected apiUrl = (path: string): string => (/^https?:/i.test(path) ? path : this.apiBase() + path);
    protected proxyHeaders = (): string[] => [`Authorization: Bearer ${this.enc.value.token}`, 'Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2022-11-28', 'Content-Type: application/json'];
    protected errorOf = (body: unknown): string | undefined => {
        const raw = rawProxyError(body);
        if (raw) return raw;
        const error = body as { message?: unknown; documentation_url?: unknown } | null;
        return error && !Array.isArray(error) && typeof error.message === 'string' && 'documentation_url' in error ? error.message : undefined;
    };

    protected connect = () =>
        new Promise<void>((resolve, reject) => {
            this.get<GitHubUser>('user').subscribe({
                next: (me) => {
                    if (!me?.login) return reject();
                    this._myUser = this.toUser(me);
                    this._isAdmin = me.site_admin ?? false;
                    this._name = this.web().replace(/(https?:\/\/)?([^/]*).*/, '$2');
                    resolve();
                },
                error: () => reject(),
            });
        });

    #repoOf = (_: Task): string => (_.var?.repo as string | undefined) ?? this.repo;
    #issuePath = (_: Task): string => `repos/${this.#repoOf(_)}/issues/${_.id}`;
}
