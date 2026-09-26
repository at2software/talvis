import { Injector, ProviderToken } from '@angular/core';
import { Router } from '@angular/router';
import { Dictionary } from '@constants/constants';
import type { Serializable } from '@models/_core/serializable';
import { BroadcastPayload, DeleteActionOptions, setNxBridge, TBroadcast } from '@models/_core/nx-bridge';
import { NxAction } from '@models/_core/nx.actions';
import { GlobalService } from '@models/global.service';
import { TalvisHttp } from '@models/http/http.talvis';
import { NxService } from './nx.service';
import { HttpClient } from '@angular/common/http';
import { Title } from '@angular/platform-browser';
import { SmartLinkDirective } from '@directives/smart-link.directive';
import { Subject } from 'rxjs';
import { ClipboardService } from './clipboard.service';
import { SelectionService } from './selection.service';
import { NxActionType } from '@models/_core/nx.actions';
import { ModalConfirmComponent } from '@app/_modals/modal-confirm/modal-confirm.component';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { ModalInputResult } from '@models/_core/modal-results';
import { ModalRef, resolveModal } from '@models/_core/modal-registry';
import type { TableSchemaDto } from '@models/_core/api-response';

/**
 * Memoized `tableName -> Set(columnField)` index for `payloadFor`. Keyed on the `tables` array
 * itself, so it is built once per `/environment` load and dropped when that array is replaced -
 * turning column membership from an O(tables + columns) rescan on every serialization into O(1).
 */
const columnIndexCache = new WeakMap<TableSchemaDto[], Map<string, Set<string>>>();
const columnsFor = (tables: TableSchemaDto[], tableName: string): Set<string> | undefined => {
    let index = columnIndexCache.get(tables);
    if (!index) {
        index = new Map(tables.map((t) => [t.name, new Set(t.columns.map((c) => c.Field))]));
        columnIndexCache.set(tables, index);
    }
    return index.get(tableName);
};

export { TBroadcast };

export class NxStatic {
    static service: TalvisHttp;
    static http: HttpClient;
    static router: Router;
    static injector: Injector;
    static global: GlobalService;
    static nxService: NxService;
    static get ME_ID(): string { return this.global?.me_id ?? ''; }
    static set ME_ID(value: string) { if (this.global) this.global.me_id = value; }
    static title: Title;
    static currentTitle?: string;
    static modalService: ModalBaseService;
    static MODEL_REGISTRY_TOKEN: Dictionary<typeof Serializable>;

    static #eventSubject = new Subject<BroadcastPayload>();
    static broadcast$ = this.#eventSubject.asObservable();
    static broadcast = (data: BroadcastPayload) => this.#eventSubject.next(data);

    static #dashboardEditSubject = new Subject<boolean>();
    static dashboardEditMode$ = this.#dashboardEditSubject.asObservable();
    static setDashboardEditMode = (editing: boolean) => this.#dashboardEditSubject.next(editing);

    static get context(): Serializable | undefined { return this.getService(SelectionService).context; }

    static deleteAction(self: Serializable, message: string | (() => string), options?: DeleteActionOptions): NxAction {
        return {
            title: $localize`:@@i18n.common.delete:delete`,
            interrupt: {
                service: ModalConfirmComponent,
                args: {
                    get message() { return typeof message === 'function' ? message() : message; },
                    title: $localize`:@@i18n.common.attention:attention`,
                },
            },
            action: options?.action ?? (() => self.delete()),
            type: NxActionType.Destructive,
            group: true,
            hotkey: 'CTRL+DELETE',
            ...(options?.roles !== undefined ? { roles: options.roles } : {}),
            ...(options?.on ? { on: options.on } : {}),
        };
    }

    static clipboardActions = (self: Serializable, addContext?: string): NxAction[] => [
        {
            title: $localize`:@@i18n.common.addToClipboard:add to clipboard`,
            group: true,
            ...(addContext ? { context: addContext } : {}),
            action: () => this.getService(ClipboardService).clip(self),
        },
        {
            title: $localize`:@@i18n.common.removeFromClipboard:remove from clipboard`,
            group: true,
            on: (): boolean => this.getService(ClipboardService).hasClip(self),
            action: () => this.getService(ClipboardService).unclip(self),
        },
    ];

    static getCurrentRoot = (): Serializable | undefined => this.getService(SelectionService).getRoot();

    static getService<T>(token: ProviderToken<T>): T {
        try {
            return NxStatic.injector.get(token) as T;
        } catch (error) {
            console.error('NxStatic.getService could not resolve token - is it @Injectable({ providedIn: \'root\' })?', token);
            throw error;
        }
    }

    static payload(obj: Serializable, hidden: string[] = []): Dictionary {
        return NxStatic.payloadFor(obj, obj.constructor as typeof Serializable, hidden);
    }

    static payloadFor(obj: Serializable, ctor: typeof Serializable, hidden: string[] = []): Dictionary {
        const c = ctor.DB_TABLE_NAME();
        const additional = ctor.ADDITIONAL_COLUMNS();
        const o = obj as unknown as Dictionary;
        const global = NxStatic.global;
        if (!global?.tables) return obj as unknown as Dictionary;

        const fields = columnsFor(global.tables, c);
        if (!fields) {
            const _class = obj.class ?? 'unknown';
            console.trace(`table "${c}" "${_class}" "${ctor.name}" not known to TALVIS - maybe not defined in environment update`);
            return {};
        }
        const d: Dictionary = {};
        for (const i in o) {
            if (hidden.includes(i)) continue;
            if (i === 'id') continue;
            if (!fields.has(i) && !additional.includes(i)) continue;
            d[i] = o[i];
        }
        return d;
    }

    static navigateTo = (url: string) => this.router.navigate([SmartLinkDirective.dynamicUrlFor(url)]);

    static openModal<R = unknown>(ref: ModalRef, ...args: unknown[]): Promise<R | undefined> {
        return this.modalService.open(resolveModal(ref), ...args) as Promise<R | undefined>;
    }

    static confirm(title: string, message: string): Promise<boolean> {
        return this.getService(ConfirmationService).confirm({ title, message });
    }

    static promptInput(text: string, hasMore = false, infoMessage?: string, initialValue?: string): Promise<ModalInputResult | undefined> {
        return this.getService(InputModalService).open(text, hasMore, infoMessage, initialValue);
    }

    static setTitle = (title: string) => {
        this.currentTitle = title;
        this.title?.setTitle(title);
    };
}

setNxBridge(NxStatic);
