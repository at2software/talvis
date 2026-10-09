import { catchError, EMPTY, expand, map, Observable, of, reduce, switchMap, throwError } from 'rxjs';
import { Dictionary } from '@constants/constants';
import { Color } from '@constants/Color';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Task } from '@models/task/task.model';
import { Label } from '@models/task/label.model';
import { User } from '@models/user/user.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { ILinkableProjects, LinkableProject } from './plugin.instance';
import { ActivityUserResolver, ProxiedPluginInstance, rawProxyError } from './proxied.plugin.instance';

export interface JiraUser extends Dictionary { accountId: string; displayName?: string; emailAddress?: string; active?: boolean; accountType?: string; avatarUrls?: Dictionary<string>; }
interface JiraStatus { name?: string; statusCategory?: { key?: string } }
export interface JiraProject extends Dictionary { id: string; key: string; name: string; }
interface AdfNode { type?: string; text?: string; content?: AdfNode[] }
interface JiraIssue extends Dictionary { id: string; key: string; fields: { summary?: string; description?: AdfNode | null; status?: JiraStatus; assignee?: JiraUser | null; reporter?: JiraUser | null; labels?: string[]; project?: JiraProject; created?: string } }
interface JiraSearchPage { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean }
interface JiraPaged<T> { values?: T[]; isLast?: boolean }
interface JiraTransition { id: string; to?: JiraStatus }
interface JiraIssueType { id: string; name: string; subtask?: boolean; hierarchyLevel?: number }

const ISSUE_FIELDS = ['summary', 'description', 'status', 'assignee', 'reporter', 'labels', 'project', 'created'];
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const ACTIVITY_PAGE_SIZE = 50;
const DONE = 'done';

const adfToText = (node?: AdfNode | null): string => (!node ? '' : (node.text ?? (node.content ?? []).map(adfToText).join(node.type === 'doc' ? '\n' : '')));
const textToAdf = (text: string): AdfNode & { version: number } => ({
    type: 'doc',
    version: 1,
    content: text.split('\n').map((line) => ({ type: 'paragraph', content: line ? [{ type: 'text', text: line }] : [] })),
});
const isPerson = (user: JiraUser): boolean => user.accountType === 'atlassian' && user.active !== false;

export class JiraPlugin extends ProxiedPluginInstance implements ITaskPlugin, ILinkableProjects {
    override newPluginText: string = 'project key:';

    ITaskPluginProperty: boolean = true;
    tasks: Task[] = [];
    projects: JiraProject[] = [];
    projectKey: string = '';

    _myUser!: User;
    protected _name: string = '';
    protected _users: User[] = [];
    protected _labels: Label[] = [];
    #pageTokens = new Map<string, string>();

    myUser = () => (this.getRootInstance() as JiraPlugin)._myUser;
    icon = () => 'jira';
    getHref = () => this._baseUrl;
    getName = () => this._name;
    getUsers = () => this._users;
    getUserFor = (userId: string) => this._users.find((_) => _.id == userId);
    getLabels = () => this._labels;
    getLabelFor = (name: string) => this._labels.find((_) => _.name == name);

    getVcardAttributeName = () => 'X-NEXUS-JIRA';
    isUserInInstance = (accountId: string): boolean => this._users.some((_) => String(_.id) === String(accountId));
    getProfileUrl = (accountId: string): string => `${this.site()}jira/people/${accountId}`;
    getUserSelectionModalPath = () => '../../app/_modals/tracker-user-selection/tracker-user-selection.component';
    getInterfacePropertyName = () => 'ITaskPluginProperty';
    getPluginTypeName = () => 'jira';

    canManageProjectMembers = (): boolean => false;
    canAdminister = (): boolean => false;

    site = (): string => this.enc.value.url.replace(/\/?$/, '/');
    projectUrl = (projectKey: string): string => `${this.site()}browse/${projectKey}`;
    issueUrl = (issueKey: string): string => `${this.site()}browse/${issueKey}`;
    toPluginLink = (projectKey: string) => {
        const key = projectKey.trim().toUpperCase();
        const name = (this.getRootInstance() as JiraPlugin).projects.find((_) => _.key === key)?.name ?? '';
        return PluginLink.fromJson({ type: 'jira', name, url: this.projectUrl(key) });
    };

    indexLinkableProjects = (): Observable<LinkableProject[]> => {
        const page = (startAt: number) => this.get<JiraPaged<JiraProject>>('project/search', { maxResults: PAGE_SIZE, startAt, orderBy: 'name' });
        return page(0).pipe(
            expand((res, i) => (res.isLast === false && i < MAX_PAGES - 1 ? page((i + 1) * PAGE_SIZE) : EMPTY)),
            reduce((all, res) => all.concat(res.values ?? []), [] as JiraProject[]),
            map((projects) => {
                (this.getRootInstance() as JiraPlugin).projects = projects;
                return projects.map((_) => ({ id: _.key, name: _.name, description: _.key }));
            }),
        );
    };

    indexTasks = (): Observable<Task[]> => this.searchAll(this.jql(true, true));
    indexTasksPage = (page: number, pageSize: number, openOnly: boolean, assignedOnly: boolean = true): Observable<{ tasks: Task[]; hasMore: boolean }> => {
        const jql = this.jql(openOnly, assignedOnly && this.isRootInstance());
        const token = page > 1 ? this.#pageTokens.get(`${jql}|${pageSize}|${page}`) : undefined;
        if (page > 1 && !token) return of({ tasks: [], hasMore: false });
        return this.#search(jql, pageSize, token).pipe(
            map((res) => {
                if (res.nextPageToken) this.#pageTokens.set(`${jql}|${pageSize}|${page + 1}`, res.nextPageToken);
                return { tasks: (res.issues ?? []).map(this.toTask), hasMore: !!res.nextPageToken && res.isLast !== true };
            }),
        );
    };
    searchIssues = (query: string): Observable<Task[]> => {
        const term = query.trim();
        if (!term) return of([]);
        const clause = /^[a-z][a-z0-9_]*-\d+$/i.test(term)
            ? `key = "${term.toUpperCase()}"`
            : /^\d+$/.test(term) && this.projectKey
              ? `key = "${this.projectKey}-${term}"`
              : `text ~ "${term.replace(/["\\]/g, '\\$&')}"`;
        const clauses = [...this.scope(), ...(this.isRootInstance() ? ['assignee = currentUser()'] : []), clause];
        return this.#search(`${clauses.join(' AND ')} ORDER BY updated DESC`, 30).pipe(
            map((res) => (res.issues ?? []).map(this.toTask)),
            catchError(() => of([])),
        );
    };

    fetchIssue = (issueKey: string): Observable<{ href: string; state: number } | undefined> =>
        this.get<JiraIssue>(`issue/${issueKey}`, { fields: 'status' }).pipe(
            map((issue) => (issue?.key ? { href: this.issueUrl(issue.key), state: this.toState(issue.fields?.status) } : undefined)),
            catchError(() => of(undefined)),
        );

    create = (_: Task): Observable<Task> => {
        const projectKey = this.#projectKeyOf(_);
        return this.#standardIssueType(projectKey).pipe(
            switchMap((issueTypeId) =>
                this.post<{ key: string }>('issue', {
                    fields: { project: { key: projectKey }, issuetype: { id: issueTypeId }, summary: _.name, ...(_.description ? { description: textToAdf(_.description) } : {}) },
                }),
            ),
            switchMap((created) => this.get<Task>(`issue/${created.key}`, { fields: ISSUE_FIELDS.join(',') }, this.toTask)),
        );
    };
    close = (_: Task) => this.#transition(_.id, true);
    reopen = (_: Task) => this.#transition(_.id, false);
    destroy = (_: Task) => this.delete(`issue/${_.id}`);
    assign = (_: Task, user: User) => this.put(`issue/${_.id}/assignee`, { accountId: user.id });
    addLabel = (_: Task, label: string): Observable<Task> => this.put(`issue/${_.id}`, { update: { labels: [{ add: label }] } }) as unknown as Observable<Task>;
    removeLabel = (_: Task, label: string): Observable<Task> => this.put(`issue/${_.id}`, { update: { labels: [{ remove: label }] } }) as unknown as Observable<Task>;

    open = (_: Task) => window.open(_.href ?? this.issueUrl(_.id), '_blank');

    getActivityComments(_projectId: string, maxInitialItems: number = 150, resolveUser?: ActivityUserResolver): Observable<Dictionary[]> {
        const jql = this.jql(false, false, 'created');
        const maxPages = Math.ceil(maxInitialItems / ACTIVITY_PAGE_SIZE);
        return this.#search(jql, ACTIVITY_PAGE_SIZE).pipe(
            expand((res, i) => (res.nextPageToken && res.isLast !== true && i < maxPages - 1 ? this.#search(jql, ACTIVITY_PAGE_SIZE, res.nextPageToken) : EMPTY)),
            reduce((all, res) => all.concat(res.issues ?? []), [] as JiraIssue[]),
            map((issues) =>
                issues.slice(0, maxInitialItems).map((issue) =>
                    this.activityEntry(
                        {
                            author: { email: issue.fields.reporter?.emailAddress, username: issue.fields.reporter?.accountId, name: issue.fields.reporter?.displayName },
                            href: this.issueUrl(issue.key),
                            label: issue.key,
                            closed: this.toState(issue.fields.status) === 1,
                            created_at: issue.fields.created,
                        },
                        resolveUser,
                    ),
                ),
            ),
        );
    }

    protected scope = (): string[] => [];
    protected jql = (openOnly: boolean, assignedOnly: boolean, orderBy: 'updated' | 'created' = 'updated'): string => {
        const clauses = [...this.scope(), ...(assignedOnly ? ['assignee = currentUser()'] : []), ...(openOnly ? ['statusCategory != Done'] : [])];
        return `${(clauses.length ? clauses : ['updated >= -365d']).join(' AND ')} ORDER BY ${orderBy} DESC`;
    };

    protected toState = (status?: JiraStatus): number => (status?.statusCategory?.key === DONE ? 1 : 0);
    protected toLabel = (name: string) => new Label(Color.uniqueColorFromString(name), name, name);
    protected toTask = (raw: unknown): Task => {
        const issue = raw as JiraIssue;
        const fields = issue.fields ?? {};
        const t = Task.fromJson({
            id: issue.key,
            name: `[${issue.key}] ${fields.summary ?? ''}`,
            user_id: fields.assignee?.accountId,
            user_name: fields.assignee?.displayName,
            description: adfToText(fields.description),
            state: this.toState(fields.status),
            href: this.issueUrl(issue.key),
            labels: fields.labels ?? [],
            project_url: fields.project ? this.projectUrl(fields.project.key) : undefined,
            project_name: fields.project?.name,
            orig: issue,
        });
        t.var.user = this.getUserFor(fields.assignee?.accountId ?? '');
        t.var.compact = t.state == 1;
        t.httpService = this;
        return t;
    };
    protected toUser = (raw: unknown): User => {
        const data = raw as JiraUser;
        const u = User.fromJson({ id: data.accountId, name: data.displayName ?? data.accountId });
        u.var.data = { ...data, username: data.accountId, email: data.emailAddress };
        u.var.avatar_url = data.avatarUrls?.['48x48'];
        u.httpService = this;
        u.avatar = () => u.var.avatar_url;
        return u;
    };
    protected toPeople = (users: JiraUser[]): User[] => users.filter(isPerson).map(this.toUser);

    protected apiUrl = (path: string): string => `${this.site()}rest/api/3/${path}`;
    protected proxyHeaders = (): string[] => [`Authorization: Basic ${btoa(`${this.enc.value.email}:${this.enc.value.token}`)}`, 'Accept: application/json', 'Content-Type: application/json'];
    protected errorOf = (body: unknown): string | undefined => {
        const raw = rawProxyError(body);
        if (raw) return raw;
        const error = body as { errorMessages?: string[]; errors?: Dictionary<string> } | null;
        const messages = [...(error?.errorMessages ?? []), ...Object.values(error?.errors ?? {})];
        return messages.length ? messages.join('; ') : undefined;
    };

    protected connect = () =>
        new Promise<void>((resolve, reject) => {
            this.get<JiraUser>('myself')
                .pipe(
                    switchMap((me) => {
                        if (!me?.accountId) return throwError(() => new Error('no account'));
                        this._myUser = this.toUser(me);
                        this._name = this.site().replace(/(https?:\/\/)?([^/]*).*/, '$2');
                        return this.aget<JiraUser>('users/search', { maxResults: 1000 }).pipe(catchError(() => of([] as JiraUser[])));
                    }),
                )
                .subscribe({
                    next: (users) => {
                        this._users = this.toPeople(users);
                        resolve();
                    },
                    error: () => reject(),
                });
        });

    #search = (jql: string, maxResults: number, nextPageToken?: string): Observable<JiraSearchPage> =>
        this.post<JiraSearchPage>('search/jql', { jql, fields: ISSUE_FIELDS, maxResults, ...(nextPageToken ? { nextPageToken } : {}) });

    protected searchAll = (jql: string): Observable<Task[]> =>
        this.#search(jql, PAGE_SIZE).pipe(
            expand((res, i) => (res.nextPageToken && res.isLast !== true && i < MAX_PAGES - 1 ? this.#search(jql, PAGE_SIZE, res.nextPageToken) : EMPTY)),
            reduce((all, res) => all.concat((res.issues ?? []).map(this.toTask)), [] as Task[]),
        );

    #projectKeyOf = (_: Task): string => this.projectKey || (_.project_url ?? '').replace(/^.*\/browse\//, '');

    #standardIssueType = (projectKey: string): Observable<string> =>
        this.get<{ issueTypes?: JiraIssueType[]; values?: JiraIssueType[] }>(`issue/createmeta/${projectKey}/issuetypes`).pipe(
            map((res) => {
                const standard = (res.issueTypes ?? res.values ?? []).filter((_) => !_.subtask && (_.hierarchyLevel ?? 0) === 0);
                const type = standard.find((_) => _.name.toLowerCase() === 'task') ?? standard[0];
                if (!type) throw new Error(`no standard issue type in ${projectKey}`);
                return type.id;
            }),
        );

    #transition = (issueKey: string, toDone: boolean): Observable<unknown> =>
        this.get<{ transitions?: JiraTransition[] }>(`issue/${issueKey}/transitions`).pipe(
            switchMap((res) => {
                const transition = (res.transitions ?? []).find((_) => (_.to?.statusCategory?.key === DONE) === toDone);
                return transition ? this.post(`issue/${issueKey}/transitions`, { transition: { id: transition.id } }) : throwError(() => new Error(`no matching transition for ${issueKey}`));
            }),
        );
}
