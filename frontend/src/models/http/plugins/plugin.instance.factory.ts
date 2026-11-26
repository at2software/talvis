import { Dictionary } from '@constants/constants';
import { inject, Type, Service } from '@angular/core';
import { hasLinkableProjects, IPlugin, PluginInstance } from './plugin.instance';
import { Encryption } from '@models/encryption/encryption.model';
import { MattermostPlugin } from './plugin.mattermost';
import { GitLabLinkError, GitLabPlugin } from './plugin.gitlab';
import { nx } from '@models/_core/nx-bridge';
import { HttpClient } from '@angular/common/http';
import { MantisPlugin } from './plugin.mantis';
import { SlackPlugin } from './plugin.slack';
import { LocalAIPlugin } from './plugin.localai';
import { CalendarPlugin } from './plugin.calendar';
import { JiraPlugin } from './plugin.jira';
import { GitHubPlugin } from './plugin.github';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import { TaskService } from '@models/task/task.service';
import type { INxModal } from '@models/_core/nx.modal.interface';
import type { Serializable } from '@models/_core/serializable';
import { Toast } from '@shards/toast/toast';
import { catchError, concatMap, defaultIfEmpty, firstValueFrom, from, map, Observable, of, toArray } from 'rxjs';

/** Above this many links from one input, the user confirms before they are stored. */
export const PLUGIN_LINK_CONFIRM_THRESHOLD = 10;

export interface StoredPluginLinks {
    created: PluginLink[];
    skipped: number;
    failed: number;
}

let MantisSubPlugin: Type<PluginInstance> | null = null;
let GitLabSubPlugin: Type<PluginInstance> | null = null;
let JiraSubPlugin: Type<PluginInstance> | null = null;
let GitHubSubPlugin: Type<PluginInstance> | null = null;

Promise.all([
    import('./plugin.mantis-sub').then((m) => (MantisSubPlugin = m.MantisSubPlugin)),
    import('./plugin.gitlab-sub').then((m) => (GitLabSubPlugin = m.GitLabSubPlugin)),
    import('./plugin.jira-sub').then((m) => (JiraSubPlugin = m.JiraSubPlugin)),
    import('./plugin.github-sub').then((m) => (GitHubSubPlugin = m.GitHubSubPlugin)),
]).catch();

export interface TPluginAllocations {
    type: Type<PluginInstance>;
    sub?: () => Type<PluginInstance> | null;
    personal?: boolean;
}

const PLUGIN_TYPES: Dictionary<TPluginAllocations> = {
    mattermost: { type: MattermostPlugin },
    git: { type: GitLabPlugin, sub: () => GitLabSubPlugin },
    mantis: { type: MantisPlugin, sub: () => MantisSubPlugin },
    jira: { type: JiraPlugin, sub: () => JiraSubPlugin },
    github: { type: GitHubPlugin, sub: () => GitHubSubPlugin },
    slack: { type: SlackPlugin },
    local_ai: { type: LocalAIPlugin },
    calendar: { type: CalendarPlugin, personal: true },
};

@Service()
export class PluginInstanceFactory {
    currentId: number = 0;
    http = inject(HttpClient);
    talvisTaskInstance: TaskService = inject(TaskService);
    instances: Dictionary<PluginInstance> = {};

    static async getModalComponentForPlugin(pluginInstance: PluginInstance): Promise<Type<INxModal<string>> | null> {
        const pluginTypeName = pluginInstance.getPluginTypeName();

        try {
            switch (pluginTypeName) {
                case 'mantisbt':
                    return (await import('@app/_modals/mantis-user-selection/mantis-user-selection.component')).MantisUserSelectionComponent;
                case 'gitlab':
                case 'gitea':
                    return (await import('@app/_modals/git-user-selection/git-user-selection.component')).GitUserSelectionComponent;
                case 'mattermost':
                    return (await import('@app/_modals/mattermost-user-selection/mattermost-user-selection.component')).MattermostUserSelectionComponent;
                case 'slack':
                    return (await import('@app/_modals/slack-user-selection/slack-user-selection.component')).SlackUserSelectionComponent;
                case 'jira':
                case 'github':
                    return (await import('@app/_modals/tracker-user-selection/tracker-user-selection.component')).TrackerUserSelectionComponent;
                default:
                    console.warn(`No modal component found for plugin type: ${pluginTypeName}`);
                    return null;
            }
        } catch (error) {
            console.error(`Failed to load modal component for plugin type ${pluginTypeName}:`, error);
            return null;
        }
    }

    /**
     * Asks for what to link. GitLab input may be an id, a project URL or a group URL, so the result is a
     * list of ids; every other plugin yields exactly one. `undefined` means cancelled or not resolvable
     * (an error toast has been shown then).
     */
    static async promptLinkId(pluginInstance: PluginInstance): Promise<string[] | undefined> {
        const { ModalBaseService } = await import('@app/_modals/modal-base-service');
        if (pluginInstance instanceof MantisPlugin) {
            const { MantisProjectSelectionComponent } = await import('@app/_modals/mantis-project-selection/mantis-project-selection.component');
            return PluginInstanceFactory.#asList(await ModalBaseService.open(MantisProjectSelectionComponent, pluginInstance));
        }
        if (hasLinkableProjects(pluginInstance)) {
            const { TrackerProjectSelectionComponent } = await import('@app/_modals/tracker-project-selection/tracker-project-selection.component');
            return PluginInstanceFactory.#asList(await ModalBaseService.open(TrackerProjectSelectionComponent, pluginInstance));
        }
        const { InputModalService } = await import('@app/_modals/modal-input/modal-input.service');
        const response = await nx().getService(InputModalService).open(pluginInstance.newPluginText);
        const text = response && 'text' in response ? response.text : undefined;
        if (!(pluginInstance instanceof GitLabPlugin)) return PluginInstanceFactory.#asList(text);
        if (text === undefined || text === null || String(text).trim() === '') return undefined;
        try {
            return await firstValueFrom(pluginInstance.resolveLinkInput(String(text)));
        } catch (err) {
            Toast.error(PluginInstanceFactory.gitLabLinkErrorMessage(err));
            return undefined;
        }
    }

    static gitLabLinkErrorMessage(err: unknown): string {
        switch (err instanceof GitLabLinkError ? err.reason : undefined) {
            case 'foreign-host':
                return $localize`:@@i18n.plugins.gitlab_link_foreign_host:The URL does not belong to the GitLab instance of this token.`;
            case 'empty-group':
                return $localize`:@@i18n.plugins.gitlab_link_empty_group:The group contains no repositories you have access to.`;
            case 'not-found':
            case 'empty':
                return $localize`:@@i18n.plugins.gitlab_link_not_found:No GitLab project or group found for this input, or your token has no access to it.`;
            default:
                return $localize`:@@i18n.plugins.gitlab_link_failed:The GitLab project or group could not be resolved.`;
        }
    }

    /**
     * Stores one plugin link per id under `parent`, one after another. Links whose URL is already in
     * `parent.plugin_links` (or repeats within `ids`) are skipped. The caller refreshes `plugin_links`
     * once with the result; nothing is pushed here.
     */
    static storeLinks(pluginInstance: PluginInstance, parent: Serializable & { plugin_links?: PluginLink[] }, ids: string[]): Observable<StoredPluginLinks> {
        const known = new Set((parent.plugin_links ?? []).map((_) => _.url));
        const fresh: PluginLink[] = [];
        for (const id of ids) {
            const link = pluginInstance.toPluginLink(id);
            if (known.has(link.url)) continue;
            known.add(link.url);
            fresh.push(link);
        }
        const skipped = ids.length - fresh.length;
        return from(fresh).pipe(
            concatMap((link) => link.storeUnder(parent, true).pipe(catchError(() => of(undefined)))),
            toArray(),
            defaultIfEmpty([] as (PluginLink | undefined)[]),
            map((stored) => {
                const created = stored.filter((_): _ is PluginLink => !!_);
                return { created, skipped, failed: stored.length - created.length };
            }),
        );
    }

    /** Confirms large batches, stores them and reports what happened. Resolves with the created links. */
    static async addLinks(pluginInstance: PluginInstance, parent: Serializable & { plugin_links?: PluginLink[] }, ids: string[]): Promise<PluginLink[]> {
        const known = new Set((parent.plugin_links ?? []).map((_) => _.url));
        const count = new Set(ids.map((_) => pluginInstance.toPluginLink(_).url).filter((_) => !known.has(_))).size;
        if (count > PLUGIN_LINK_CONFIRM_THRESHOLD) {
            const { ConfirmationService } = await import('@app/_modals/modal-confirm/confirmation.service');
            const ok = await nx()
                .getService(ConfirmationService)
                .ask({
                    title: $localize`:@@i18n.plugins.links_confirm_title:Add plugin links`,
                    message: $localize`:@@i18n.plugins.links_confirm_message:${count}:count: repositories will be linked. Continue?`,
                });
            if (!ok) return [];
        }
        const result = await firstValueFrom(PluginInstanceFactory.storeLinks(pluginInstance, parent, ids));
        PluginInstanceFactory.notifyStored(result);
        return result.created;
    }

    static notifyStored({ created, skipped, failed }: StoredPluginLinks): void {
        const message = $localize`:@@i18n.plugins.links_created_skipped:${created.length}:created: link(s) added, ${skipped}:skipped: already linked.`;
        if (failed) Toast.warn(message + ' ' + $localize`:@@i18n.plugins.links_failed:${failed}:failed: could not be saved.`);
        else if (created.length) Toast.success(message);
        else Toast.info(message);
    }

    static #asList = (value: string | null | undefined): string[] | undefined => (value === undefined || value === null || value === '' ? undefined : [value]);

    constructor() {
        this.talvisTaskInstance.init.next();
    }

    getPluginEncryptionsOfType = (type: string): Encryption[] => nx().global.encryptions.filter((_) => _.key === type);
    getPluginEncryptions = (): Encryption[] => nx().global.encryptions.filter((_) => _.key in PLUGIN_TYPES);
    getLinkablePluginEncryptions = (): Encryption[] => this.getPluginEncryptions().filter((_) => !PLUGIN_TYPES[_.key].personal);
    getPluginInstances = (): PluginInstance[] => {
        const instances = nx().global.encryptions
            .filter((_) => _.key in PLUGIN_TYPES)
            .map((_) => this.instanceFor(_))
            .filter((_) => _ !== undefined) as PluginInstance[];
        instances.unshift(this.talvisTaskInstance);
        return instances;
    };
    getRootPluginInstancesOfType = <T extends IPlugin>(interfaceType: Type<T>): (PluginInstance & T)[] => this.getPluginInstances().filter((_) => _ && _ instanceof interfaceType && _.isRootInstance()) as (PluginInstance & T)[];
    getPluginInstancesOfType = <T extends IPlugin>(interfaceType: Type<T>): (PluginInstance & T)[] => this.getPluginInstances().filter((_) => _ && _ instanceof interfaceType) as (PluginInstance & T)[];
    getRootPluginInstancesByConstructor = <T extends PluginInstance>(ctor: Type<T>): T[] => this.getPluginInstances().filter((_) => _ && _ instanceof ctor && _.isRootInstance()) as T[];

    getRepositoryInstances(project: unknown): PluginInstance[] {
        const p = project as { plugin_links?: PluginLink[] } | null | undefined;
        if (!p || !p.plugin_links) return [];
        return p.plugin_links.map((link: PluginLink) => this.instanceFor(link)).filter((inst: PluginInstance | undefined) => inst && 'IRepositoryPluginProperty' in inst) as PluginInstance[];
    }

    getTaskInstances(project: unknown): PluginInstance[] {
        const p = project as { plugin_links?: PluginLink[] } | null | undefined;
        if (!p || !p.plugin_links) return [];
        return p.plugin_links.map((link: PluginLink) => this.instanceFor(link)).filter((inst: PluginInstance | undefined) => inst && 'ITaskPluginProperty' in inst) as PluginInstance[];
    }

    getChatInstances(project: unknown): PluginInstance[] {
        const p = project as { plugin_links?: PluginLink[] } | null | undefined;
        if (!p || !p.plugin_links) return [];
        return p.plugin_links.map((link: PluginLink) => this.instanceFor(link)).filter((inst: PluginInstance | undefined) => inst && 'IChatPluginProperty' in inst) as PluginInstance[];
    }

    /**
     * @param project - Project with plugin_links
     * @param propertyNames - Array of property names to filter by (e.g., ['ITaskPluginProperty', 'IChatPluginProperty'])
     * @returns Array of matching plugin instances
     */
    getInstances(project: unknown, propertyNames: string[]): PluginInstance[] {
        const p = project as { plugin_links?: PluginLink[] } | null | undefined;
        if (!p || !p.plugin_links) return [];
        const seen = new Set<PluginInstance>();
        return p.plugin_links
            .map((link: PluginLink) => this.instanceFor(link))
            .filter((inst: PluginInstance | undefined) => {
                if (!inst) return false;
                const hasProperty = propertyNames.some((propName) => propName in inst);
                if (hasProperty && !seen.has(inst)) {
                    seen.add(inst);
                    return true;
                }
                return false;
            }) as PluginInstance[];
    }

    /**
     * @param object - Object with plugin_links property (e.g., Project)
     * @param constructorName - Constructor name to filter by (e.g., 'MantisSubPlugin', 'GitLabSubPlugin')
     * @returns Plugin instance or undefined
     */
    instancesFor<T extends PluginInstance>(object: unknown, ctor?: Type<T>): T | undefined {
        const obj = object as { plugin_links?: PluginLink[] } | null | undefined;
        if (!obj || !obj.plugin_links) {
            return undefined;
        }

        const link = obj.plugin_links.find((link: PluginLink) => {
            const instance = this.instanceFor(link);
            if (!instance) return false;
            if (ctor) {
                return instance instanceof ctor;
            }
            return true;
        });
        return link ? (this.instanceFor(link) as T) : undefined;
    }

    instanceFor(encryption: Encryption): PluginInstance | undefined;
    instanceFor(url: string): PluginInstance | undefined;
    instanceFor(url: PluginLink): PluginInstance | undefined;
    instanceFor(obj: Encryption | string | PluginLink): PluginInstance | undefined;
    instanceFor(obj: Encryption | string | PluginLink): PluginInstance | undefined {
        let url: string | undefined = undefined;

        if (!obj) return undefined;
        if (obj instanceof Encryption) {
            url = obj.value.url;
        } else if (obj instanceof PluginLink) url = obj.url;
        else url = obj;
        if (!url) {
            return undefined;
        }
        if (url in this.instances) {
            return this.instances[url]; // already initialized
        }
        if (obj instanceof Encryption) {
            if (obj.key in PLUGIN_TYPES) {
                const PluginClass = PLUGIN_TYPES[obj.key].type;
                const instance: PluginInstance = new PluginClass();
                instance._http = this.http;
                instance.load(url, obj);
                instance.id = this.currentId++;
                this.instances[url] = instance;
                return instance;
            }
        } else if (obj instanceof PluginLink) {
            const result = this.findInstance(obj.url);
            let instance = result[0];
            const enc = result[1];
            if (instance && enc) {
                instance.load(url, enc, this.instanceFor(enc), obj);
            } else {
                instance = this.getInstanceFor(obj.type);
                if (instance) {
                    instance._http = this.http;
                    instance._baseUrl = obj.url;
                    instance.state = 'no token';
                    this.instances[url] = instance;
                }
            }
            return instance ?? undefined;
        } else {
            const [instance, enc] = this.findInstance(obj);
            if (instance && enc) {
                instance.load(url, enc, this.instanceFor(enc));
            }
        }
        return undefined;
    }
    findInstance(url: string): [PluginInstance, Encryption] | [null, null] {
        for (const enc of nx().global.encryptions) {
            if (url.startsWith(enc.value?.url)) {
                const instance = this.getInstanceFor(enc.key);
                if (!instance) continue;
                instance._http = this.http;
                instance.id = this.currentId++;
                this.instances[url] = instance;
                return [instance, enc];
            }
        }
        return [null, null];
    }
    getInstanceFor = (key: string): PluginInstance | null => {
        const pluginConfig = PLUGIN_TYPES[key];
        if (!pluginConfig) return null;

        const SubPluginClass = pluginConfig.sub?.();
        const PluginClass = SubPluginClass || pluginConfig.type;
        return new PluginClass();
    };

    static getInstances<T>(links: PluginLink[], ctorName: string): Promise<(PluginInstance & T)[]> {
        return new Promise<(PluginInstance & T)[]>((resolve) => {
            const factory = nx().getService(PluginInstanceFactory);
            const instances = links.map((_) => factory.instanceFor(_)).filter((_) => _ && ctorName + 'Property' in _);
            Promise.all(instances.map((_) => _!.init)).then(() => {
                resolve(instances as unknown[] as (PluginInstance & T)[]);
            });
        });
    }
}
