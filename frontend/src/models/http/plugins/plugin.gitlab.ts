import { Dictionary } from '@constants/constants';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { PluginInstance } from './plugin.instance';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Task } from '@models/task/task.model';
import { Label } from '@models/task/label.model';
import { User } from '@models/user/user.model';
import { PluginLink } from '@models/plugin-link/plugin-link.model';

interface GitLabUser { id: number; name: string; username?: string; avatar_url?: string; email?: string; is_admin?: boolean; }
interface GitLabIssue { iid: number; project_id: number; title: string; description?: string; assignee?: { id: number; name: string }; author?: { name?: string; email?: string; username?: string }; state: string; web_url: string; labels: string[]; references: { full: string }; _links: { project: string }; created_at?: string; }
export interface GitLabBranch { name: string; default: boolean; protected: boolean; }
export interface GitLabMergeRequest { iid: number; state: string; sha?: string; detailed_merge_status?: string; has_conflicts?: boolean; diff_refs?: { base_sha: string; start_sha: string; head_sha: string } | null; web_url: string; source_branch: string; target_branch: string; }
export interface GitLabCompare { diffs: GitLabDiffFile[]; }
export interface GitLabDiffFile { old_path: string; new_path: string; new_file: boolean; deleted_file: boolean; renamed_file: boolean; diff: string; too_large?: boolean; collapsed?: boolean; }
export interface GitLabPipeline { id: number; ref: string; web_url: string; }
interface GitLabEvent { action_name?: string; author?: { name?: string; email?: string; username?: string }; push_data?: { ref?: string; commit_count?: number }; created_at?: string; }
interface GitLabLabel { id: number; name: string; color: string; }
interface GitLabProject { id: number; }

/** Why a link input could not be resolved into GitLab project ids. */
export type GitLabLinkErrorReason = 'empty' | 'foreign-host' | 'not-found' | 'empty-group';

export class GitLabLinkError extends Error {
    constructor(
        readonly reason: GitLabLinkErrorReason,
        readonly input: string,
    ) {
        super(`GitLab link input "${input}" could not be resolved: ${reason}`);
        this.name = 'GitLabLinkError';
    }
}

const GROUP_PAGE_SIZE = 100;
const GROUP_MAX_PAGES = 50;

export interface IRepositoryPlugin {
    IRepositoryPluginProperty: boolean;
}

export class GitLabPlugin extends PluginInstance implements ITaskPlugin, IRepositoryPlugin {
    override baseUrl = (): string => this.enc.value.url + 'api/v4/' + this._baseUrl.substring(this.enc.value.url.length) + '/';

    ITaskPluginProperty: boolean = true;
    IRepositoryPluginProperty: boolean = true;
    tasks: Task[] = [];

    _myUser!: User;
    _isAdmin: boolean = false;

    #users: User[] = [];
    #labels: Label[] = [];

    myUser = () => (this.getRootInstance() as GitLabPlugin)._myUser;
    icon = () => 'git';
    getHref = () => this._baseUrl;
    getName = () => this.#getRepositoryName();
    getUsers = () => this.#users;
    getUserFor = (userId: string) => this.#users.find((_) => _.id == userId);
    getLabels = () => this.#labels;
    getLabelFor = (name: string) => this.#labels.find((_) => _.name == name);

    getVcardAttributeName = () => 'X-NEXUS-GIT';
    isUserInInstance = (username: string): boolean => this.getUsers().some((_) => String(_.var?.data?.username) === String(username));
    getProfileUrl = (username: string): string => {
        const gitUrl = this.enc.value.url.replace(/\/$/, '');
        return `${gitUrl}/${username}`;
    };
    getUserSelectionModalPath = () => '../../app/_modals/git-user-selection/git-user-selection.component';
    getInterfacePropertyName = () => 'IRepositoryPluginProperty';
    getPluginTypeName = () => 'gitlab';
    indexMembers = (): Observable<unknown[]> => this.aget(`${this.enc.value.url}api/v4/users`, {}, this.toUser);
    indexLabels = () => this.get('labels', {}, (_: unknown) => { const l = _ as GitLabLabel; return new Label(l.color, l.name, String(l.id)); });
    indexTasks = (): Observable<Task[]> => {
        const pageSize = 100;
        return this.fetchAllPages((page) => this.aget(`issues?assignee_id=${this.myUser().id}&state=opened&per_page=${pageSize}&page=${page}`, {}, this.toTask), pageSize);
    };
    indexTasksPage = (page: number, pageSize: number, openOnly: boolean, assignedOnly: boolean = true): Observable<{ tasks: Task[]; hasMore: boolean }> => {
        const state = openOnly ? 'opened' : 'all';
        const assigneeParam = assignedOnly ? `assignee_id=${this.myUser().id}&` : '';
        return (this.aget(`issues?${assigneeParam}state=${state}&per_page=${pageSize}&page=${page}`, {}, this.toTask)).pipe(map((tasks) => ({ tasks, hasMore: tasks.length >= pageSize })));
    };
    searchIssues = (query: string): Observable<Task[]> =>
        this.aget(`issues?assignee_id=${this.myUser().id}&search=${encodeURIComponent(query)}&per_page=30`, {}, this.toTask);
    showProject = () => this.get('');
    hasToken = (): boolean => !!this.enc?.value?.token && this.state !== 'no token';
    branches = (): Observable<GitLabBranch[]> => this.aget<GitLabBranch>('repository/branches', { per_page: 100 });
    fileExists = (filePath: string, ref: string): Observable<boolean> =>
        this.http().get(`${this.baseUrl()}repository/files/${encodeURIComponent(filePath)}`, { params: { ref } }).pipe(map(() => true), catchError(() => of(false)));
    commitFile = (filePath: string, content: string, branch: string, message: string): Observable<string> =>
        this.fileExists(filePath, branch).pipe(
            switchMap((exists) => this.post('repository/commits', { branch, commit_message: message, actions: [{ action: exists ? 'update' : 'create', file_path: filePath, content }] })),
            map(() => branch),
        );
    override newPluginText: string = 'ID or URL (project/group):';

    /**
     * Turns what a user pastes into the link dialog into GitLab project ids: a numeric id, a project URL
     * or a group URL (resolved into all non-archived repos, subgroups included). Errors with a
     * {@link GitLabLinkError}. GitLab answers 404 both for "does not exist" and for "no access".
     */
    resolveLinkInput = (input: string): Observable<string[]> => {
        const text = (input ?? '').trim();
        if (!text) return throwError(() => new GitLabLinkError('empty', text));
        if (/^\d+$/.test(text)) return of([text]);

        const base = this.#gitLabBase();
        let path = text;
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
            if (!text.toLowerCase().startsWith(base.toLowerCase() + '/')) return throwError(() => new GitLabLinkError('foreign-host', text));
            path = text.substring(base.length);
        }
        path = path
            .replace(/[?#].*$/, '')
            .replace(/\/-(\/.*)?$/, '')
            .replace(/\/+$/, '')
            .replace(/\.git$/i, '')
            .replace(/^\/+|\/+$/g, '');
        if (!path) return throwError(() => new GitLabLinkError('not-found', text));

        const projectId = /^projects\/(\d+)$/.exec(path);
        if (projectId) return of([projectId[1]]);
        if (path.startsWith('groups/')) return this.#resolveGroup(path.substring('groups/'.length), text);

        return this.#http()
            .get<GitLabProject>(`${base}/api/v4/projects/${encodeURIComponent(path)}`)
            .pipe(
                map((project) => {
                    if (project?.id === undefined || project.id === null) throw new GitLabLinkError('not-found', text);
                    return [String(project.id)];
                }),
                catchError((err: unknown) => (err instanceof HttpErrorResponse && err.status === 404 ? this.#resolveGroup(path, text) : throwError(() => err))),
            );
    };

    toPluginLink = (id: string) => PluginLink.fromJson({ type: 'git', url: this.enc.value.url + 'projects/' + id });
    mergeRequest = (iid: number): Observable<GitLabMergeRequest> => this.get<GitLabMergeRequest>(`merge_requests/${iid}`);
    mergeRequestDiffs = (iid: number): Observable<GitLabDiffFile[]> => this.aget<GitLabDiffFile>(`merge_requests/${iid}/diffs`, { per_page: 100 });
    compare = (from: string, to: string): Observable<GitLabCompare> => this.get<GitLabCompare>('repository/compare', { from, to });
    acceptMergeRequest = (iid: number, sha?: string | null): Observable<GitLabMergeRequest> => this.put<GitLabMergeRequest>(`merge_requests/${iid}/merge`, sha ? { sha } : {});
    createMergeRequest = (source: string, target: string, title: string): Observable<GitLabMergeRequest> =>
        this.post<GitLabMergeRequest>('merge_requests', { source_branch: source, target_branch: target, title, remove_source_branch: false });
    createPipeline = (ref: string): Observable<GitLabPipeline> => this.post<GitLabPipeline>('pipeline', { ref });

    create = (_: Task) => this.post(_.project_url + 'issues', this.toGitIssue(_));
    close = (_: Task) => this.put(_.project_url + 'issues/' + _.id, { state_event: 'close' });
    reopen = (_: Task) => this.put(_.project_url + 'issues/' + _.id, { state_event: 'reopen' });
    destroy = (_: Task) => this.delete(_.project_url + 'issues/' + _.id);
    assign = (_: Task, user: User) => this.put(_.project_url + 'issues/' + _.id, { assignee_id: user.id });
    addLabel = (_: Task, label: string): Observable<Task> => this.put(_.project_url + 'issues/' + _.id, { add_labels: label }) as unknown as Observable<Task>;
    removeLabel = (_: Task, label: string): Observable<Task> => this.put(_.project_url + 'issues/' + _.id, { remove_labels: label }) as unknown as Observable<Task>;

    open = (_: Task) => window.open(_.href, '_blank');

    canManageProjectMembers = (): boolean => this.canAdminister();
    canAdminister = (): boolean => (this.getRootInstance() as GitLabPlugin)._isAdmin;

    fetchIssue = (issueId: string): Observable<{ href: string; state: number } | undefined> =>
        this.get<GitLabIssue>('issues/' + issueId).pipe(
            map((issue) => (issue ? { href: issue.web_url, state: issue.state?.toLowerCase() === 'closed' ? 1 : 0 } : undefined)),
            catchError(() => of(undefined)),
        );

    getActivityComments(projectId: string, maxInitialItems: number = 150, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]> {
        const cleanProjectId = projectId.replace(/^projects\//, '');

        const maxPages = Math.ceil(maxInitialItems / 50);
        const pageRequests: Observable<Dictionary[]>[] = [];

        for (let page = 1; page <= maxPages; page++) {
            pageRequests.push(this.#getActivityCommentsPage(cleanProjectId, page, resolveUser).pipe(catchError(() => of([]))));
        }
        return forkJoin(pageRequests).pipe(map((pagesResults: Dictionary[][]) => pagesResults.flat().slice(0, maxInitialItems)));
    }

    protected connect = () =>
        new Promise<void>((resolve, reject) => {
            this.get('user')
                .pipe(catchError(() => this.handleError(reject)))
                .subscribe((_) => {
                    const u = this.toUser(_ as GitLabUser);
                    if (u) {
                        this._myUser = u;
                        this._isAdmin = (_ as GitLabUser).is_admin ?? false;
                        resolve();
                    } else {
                        reject();
                    }
                });
        });

    protected toTask = (raw: unknown): Task => {
        const _ = raw as GitLabIssue;
        const t = Task.fromJson({
            id: '' + _.iid,
            name: `[#${_.iid}] ${_.title}`,
            user_id: _.assignee?.id,
            user_name: _.assignee?.name,
            description: _.description ? _.description : '',
            state: 'state' in _ && _.state.toLowerCase() == 'closed' ? 1 : 0,
            href: _.web_url,
            labels: _.labels,
            project_url: `${this.enc.value.url}projects/${_.project_id}`,
            project_name: _.references.full,
            orig: _,
        });
        t.var.user = this.getUserFor(String(_.assignee?.id ?? ''));
        t.var.compact = t.state == 1;
        t.httpService = this;
        return t;
    };
    protected toGitIssue = (_: Task) => ({
        title: _.name,
    });
    protected toUser = (raw: unknown): User | undefined => {
        const data = raw as GitLabUser | undefined;
        if (!data) {
            return undefined;
        }
        const u = User.fromJson({
            id: data.id,
            name: data.name,
        });
        u.var.avatar_url = data.avatar_url;
        u.var.data = data;
        u.httpService = this;
        u.avatar = () => u.var.avatar_url;
        return u;
    };

    #gitLabBase = (): string => (this.getRootInstance().enc ?? this.enc).value.url.replace(/\/+$/, '');
    #http = () => this.getRootInstance().http() ?? this.http();
    #resolveGroup = (groupPath: string, input: string): Observable<string[]> => {
        if (!groupPath) return throwError(() => new GitLabLinkError('not-found', input));
        const url = `${this.#gitLabBase()}/api/v4/groups/${encodeURIComponent(groupPath)}/projects`;
        const requestPage = (page: number) =>
            this.#http().get<GitLabProject[]>(url, { params: { include_subgroups: 'true', archived: 'false', per_page: GROUP_PAGE_SIZE, page } }).pipe(map((_) => (Array.isArray(_) ? _ : [])));
        return this.fetchAllPages(requestPage, GROUP_PAGE_SIZE, GROUP_MAX_PAGES).pipe(
            map((projects) => [...new Set(projects.map((_) => String(_.id)))]),
            map((ids) => {
                if (!ids.length) throw new GitLabLinkError('empty-group', input);
                return ids;
            }),
            catchError((err: unknown) => throwError(() => (err instanceof HttpErrorResponse && err.status === 404 ? new GitLabLinkError('not-found', input) : err))),
        );
    };
    #getRepositoryName = () => this._baseUrl.replace(/(https?:\/\/)?([^/]*).*/, '$2');
    #getActivityCommentsPage(_projectId: string, page: number, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]> {
        const events$ = this.aget<GitLabEvent>(`events`, { per_page: 50, page }).pipe(
            map((events) => {
                if (!events) return [];
                return events
                    .filter((e) => e.action_name === 'pushed to')
                    .map((event) => {
                        const ref = event.push_data?.ref || 'branch';
                        const commitCount = event.push_data?.commit_count || 1;
                        const authorName = event.author?.name || 'Unknown';
                        const authorEmail = event.author?.email;
                        const authorUsername = event.author?.username;

                        const resolvedUser = resolveUser?.(authorEmail, authorUsername, authorName, 'X-NEXUS-GIT') as (Dictionary<unknown> & { id?: string; getAvatar?: () => string }) | undefined;

                        let description = '';
                        if (!resolvedUser) {
                            description += `${authorName} `;
                        }
                        description += `<n>git</n> <code>${ref}</code> [${commitCount}]`;
                        return {
                            text: description,
                            created_at: event.created_at,
                            user: resolvedUser || { name: authorName },
                            user_id: resolvedUser?.id,
                            is_mini: true,
                            icon: resolvedUser?.getAvatar?.(),
                            var: { source: 'gitlab', ...(resolvedUser ? {} : { nicon: 'git' }) },
                            itemCount: events.length,
                        };
                    });
            }),
        );

        const issues$ = this.aget<GitLabIssue>(`issues`, {
            state: 'all',
            per_page: 50,
            page,
            order_by: 'created_at',
            sort: 'desc',
        }).pipe(
            map((issues) => {
                if (!issues) return [];
                return issues.map((issue) => {
                    const isClosed = issue.state === 'closed';
                    const stateText = isClosed ? 'closed' : 'open';
                    const authorName = issue.author?.name || 'Unknown';
                    const authorEmail = issue.author?.email;
                    const authorUsername = issue.author?.username;

                    const resolvedUser = resolveUser?.(authorEmail, authorUsername, authorName, 'X-NEXUS-GIT') as (Dictionary<unknown> & { id?: string; getAvatar?: () => string }) | undefined;

                    let description = '';
                    if (!resolvedUser) {
                        description += `${authorName} `;
                    }
                    description += `<n>git</n> <a href="${issue.web_url}" target="_blank" class="text-primary">#${issue.iid}</a> [${stateText}]`;
                    return {
                        text: description,
                        created_at: issue.created_at,
                        user: resolvedUser || { name: authorName },
                        user_id: resolvedUser?.id,
                        is_mini: true,
                        icon: resolvedUser?.getAvatar?.(),
                        var: { source: 'gitlab', ...(resolvedUser ? {} : { nicon: 'git' }) },
                        itemCount: issues.length,
                    };
                });
            }),
        );

        return forkJoin([events$.pipe(catchError(() => of<Dictionary[]>([]))), issues$.pipe(catchError(() => of<Dictionary[]>([])))]).pipe(map(([events, issues]) => [...events, ...issues]));
    }
}
