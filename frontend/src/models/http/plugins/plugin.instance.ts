import { EMPTY, expand, last, map, Observable, of, ReplaySubject, scan } from 'rxjs';
import { Encryption } from '@models/encryption/encryption.model';
import { TalvisHttpInterceptor } from '@models/http/http-headers';
import { HttpHeaders } from '@angular/common/http';
import { Serializable } from '@models/_core/serializable';
import { HttpWrapper } from '../http.wrapper';
import { PluginLink } from '@models/plugin-link/plugin-link.model';
import type { Project } from '@models/project/project.model';
import { Dictionary } from '@constants/constants';

export type TPluginStates = 'idle' | 'connecting' | 'connected' | 'connection fail' | 'no token';

export abstract class IPlugin {
    IPluginProperty!: boolean;
    init!: ReplaySubject<void>;
    icon!: () => string;
    getHref!: () => string;
    getName!: () => string;
}
export abstract class PluginInstance extends HttpWrapper implements IPlugin {
    abstract icon(): string;
    abstract getHref(): string;
    abstract getName(): string;
    abstract toPluginLink(id: string): PluginLink;
    abstract getActivityComments(projectId: string, maxInitialItems?: number, resolveUser?: (email?: string, username?: string, name?: string, pluginAttribute?: string) => unknown): Observable<Dictionary[]>;

    abstract getVcardAttributeName(): string; // e.g., 'X-NEXUS-MANTISBT'
    abstract isUserInInstance(userId: string): boolean;
    abstract getProfileUrl(userId: string): string;
    abstract getUserSelectionModalPath(): string;
    abstract getInterfacePropertyName(): string; // e.g., 'ITaskPluginProperty', 'IRepositoryPluginProperty'
    abstract getPluginTypeName(): string; // e.g., 'mantisbt', 'gitlab', 'mattermost'

    IPluginProperty!: boolean;
    id!: number;
    needsHttpInterceptor: boolean = true;
    var: any;
    state: TPluginStates = 'idle';
    newPluginText: string = 'ID:';
    enc!: Encryption;
    instance!: PluginInstance; // used for http requests
    baseInstance: PluginInstance | undefined = undefined;
    init = new ReplaySubject<void>(1);
    projectId?:string;

    createBlankFor: ((project: Project) => Promise<string>) | undefined = undefined;
    protected connectWith = map<Serializable, any>((_) => {
        _.httpService = this;
        return _;
    });

    getRootInstance = (): PluginInstance => this.baseInstance ?? this;
    isRootInstance = (): boolean => (this.baseInstance ? false : true);
    canCreateTasks = (): boolean => false;

    protected fetchAllPages = <T>(requestPage: (page: number) => Observable<T[]>, pageSize: number): Observable<T[]> =>
        requestPage(1).pipe(
            expand((page, i) => (page.length < pageSize ? EMPTY : requestPage(i + 2))),
            scan((all, page) => all.concat(page), [] as T[]),
            last(),
        );

    load = (url: string, enc: Encryption, baseInstance?: PluginInstance, pluginLink?: PluginLink) => {
        this.enc = enc;
        this._baseUrl = url;
        if (baseInstance) {
            this.baseInstance = baseInstance;
            this.baseInstance.init.subscribe(() => {
                this.connectSub(pluginLink).then(this.#propagateConnectedState).catch(this.#propagateConnectionFailState);
            });
        } else {
            if (this.state === 'idle') {
                this.state = 'connecting';
                if (this.needsHttpInterceptor) {
                    TalvisHttpInterceptor.add(this.enc.value.url, this.interceptorHeaders());
                }
                this.connect(url).then(this.#propagateConnectedState).catch(this.#propagateConnectionFailState);
            }
        }
    };
    getStateCss() {
        switch (this.state) {
            case 'idle':
                return 'dark-grey';
            case 'connecting':
                return 'grey';
            case 'connected':
                return 'success';
            case 'connection fail':
                return 'danger';
            case 'no token':
                return 'orange';
        }
    }

    protected abstract connect(url: string): Promise<void>;
    protected connectSub = (_pluginLink?: PluginLink): Promise<void> => Promise.resolve();
    protected interceptorHeaders = () => new HttpHeaders({ Authorization: `Bearer ${this.enc.value.token}`, 'Content-Type': 'application/json' });
    protected handleError(reject: (reason?: unknown) => void) {
        reject();
        return of([]);
    }
    #propagateConnectedState = () => {
        this.state = 'connected';
        this.init.next();
    };
    #propagateConnectionFailState = () => {
        this.state = 'connection fail';
    };
}
