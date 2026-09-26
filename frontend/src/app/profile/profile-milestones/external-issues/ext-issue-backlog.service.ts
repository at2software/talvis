import { inject, Service } from '@angular/core';
import { catchError, concat, forkJoin, map, Observable, of, switchMap, take, timeout } from 'rxjs';
import { PluginInstance } from '@models/http/plugins/plugin.instance';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { ITaskPlugin } from '@models/task/task.plugin.interface';
import { Task } from '@models/task/task.model';
import { Project } from '@models/project/project.model';
import { ProjectPluginLinkResolution, ProjectService } from '@models/project/project.service';

export interface ExtIssueProjectMatch {
    project: Project;
    pluginLinkId: string;
}

export interface ExtIssueBacklogItem {
    id: string;
    task: Task;
    issueId: string;
    resolved: ExtIssueProjectMatch[];
    project?: Project;
    pluginLinkId?: string;
    trackerProjectName: string;
    resolving: boolean;
}

const PAGE_SIZE = 100;
const CONNECT_TIMEOUT_MS = 15000;

/**
 * Aggregates "my open issues" across the user's task-tracker encryptions in one shot. Each tracker's
 * root instance exposes a *global* assigned-to-me query (GitLab `issues?assignee_id=me`, Mantis
 * `filter_id=assigned`), so we hit one endpoint per encryption instead of crawling every project -
 * issues surface even for projects the user has no milestones in. Nothing is persisted server-side.
 *
 * Issue->project resolution sends just the distinct tracker project urls the fetch actually returned
 * to the backend, which resolves them to TALVIS projects - far cheaper than listing every project (and
 * every plugin link) the user has just to find the handful that matter for these issues.
 */
@Service()
export class ExtIssueBacklogService {
    #factory = inject(PluginInstanceFactory);
    #projectService = inject(ProjectService);

    /** @param excludeKeys `pluginLinkId:issueId` pairs already converted into a Milestone. */
    loadAssignedIssues(excludeKeys: Set<string>): Observable<ExtIssueBacklogItem[]> {
        const roots = this.#factory
            .getPluginInstances()
            .filter((inst): inst is PluginInstance & ITaskPlugin => !!inst && 'ITaskPluginProperty' in inst && inst.isRootInstance())
            .filter((inst) => inst.state !== 'no token' && inst.state !== 'connection fail');

        if (!roots.length) return of([]);

        const perRootTasks = roots.map((root) =>
            root.init.pipe(
                take(1),
                timeout(CONNECT_TIMEOUT_MS),
                switchMap(() => root.indexTasksPage(1, PAGE_SIZE, true, true)),
                map(({ tasks }) => this.#assignedOpenTasks(tasks, root)),
                catchError(() => of([] as Task[])),
            ),
        );

        return forkJoin(perRootTasks).pipe(
            map((lists) => lists.flat()),
            switchMap((tasks) => {
                const pending = of(this.#toItems(tasks, [], excludeKeys, true));
                const urls = Array.from(new Set(tasks.map((t) => t.project_url).filter((u): u is string => !!u)));
                const resolved = this.#projectService.resolveProjectsByPluginLinkUrls(urls).pipe(map((matches) => this.#toItems(tasks, matches, excludeKeys, false)));
                return concat(pending, resolved);
            }),
        );
    }

    #assignedOpenTasks(tasks: Task[], root: PluginInstance & ITaskPlugin): Task[] {
        const myId = root.myUser()?.id;
        return tasks
            .filter((task) => task.state !== 1) // open only (Mantis can't filter server-side)
            .filter((task) => !myId || String(task.user_id) === String(myId));
    }

    #toItems(tasks: Task[], matches: ProjectPluginLinkResolution[], excludeKeys: Set<string>, resolving: boolean): ExtIssueBacklogItem[] {
        return tasks
            .map((task): ExtIssueBacklogItem => {
                const resolved = matches.filter((m) => m.url === task.project_url).map((m): ExtIssueProjectMatch => ({ project: m.project, pluginLinkId: m.pluginLinkId }));
                const first = resolved[0];
                const id = first ? `${first.pluginLinkId}:${task.id}` : `${task.project_url ?? task.project_id}:${task.id}`;
                return {
                    id,
                    task,
                    issueId: task.id,
                    resolved,
                    project: first?.project,
                    pluginLinkId: first?.pluginLinkId,
                    trackerProjectName: first?.project.name ?? task.project_name ?? task.project_url ?? '',
                    resolving,
                };
            })
            .filter((item) => !excludeKeys.has(item.id));
    }
}
