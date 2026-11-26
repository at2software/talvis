import { environment } from '@environments/environment';
import { dayjs, Dayjs } from '@constants/date/dates';
import type { NxAction } from '@models/_core/nx.actions';
import { computed, ProviderToken, Signal, signal, Type, untracked, WritableSignal } from '@angular/core';
import { nx } from '@models/_core/nx-bridge';
import type { Observable } from 'rxjs';
import type { HttpWrapper } from '../http/http.wrapper';
import type { INxContextMenu } from '@models/_core/nx.contextmenu.interface';
import type { ModalInputResult } from '@models/_core/modal-results';
import { nextTrackId } from '@models/_core/nx.track-id';
import { jsonSafe } from '@constants/object/jsonSafe';
import { Exclude, Transform, hydrate } from '@models/_core/hydrate';
import { deepCopy } from '@constants/object/deepClone';
import { Marker } from '@enums/marker';
import { Dictionary } from '@constants/constants';
import { LiveModelRegistry } from '@models/live/live-model-registry';
import { initNestedSerializables } from '@models/_core/nested-init';
import { baselineFor, changedFields } from '@models/_core/dirty-tracking';
import { cloneOf } from '@models/_core/clone';
import * as Params from '@models/_core/params';
import * as Persistence from '@models/_core/persistence';
import * as Ui from '@models/_core/ui-bridge';

const BACKEND_MODEL_NAMESPACE = 'App\\Models\\';
const ABSOLUTE_URL = /^(https?:|data:|\/)/;

/**
 * Resolves a payload `icon` against the api url. Absolute urls (http(s), data, root-relative) are kept
 * as they are; an empty icon falls back to the given api-relative path.
 */
export const resolveIconUrl = (icon: unknown, fallback: string): string => {
    const path = typeof icon === 'string' ? icon : '';
    return ABSOLUTE_URL.test(path) ? path : environment.envApi + (path || fallback);
};

export type Badge = [string, string];

export abstract class Serializable implements INxContextMenu {

    static API_PATH(): string { throw new Error(`${this.name} must override static API_PATH()`); }
    static DB_TABLE_NAME(): string { return this.API_PATH() }
    static ADDITIONAL_COLUMNS(): string[] { return [] }

    frontendUrl = (): string | undefined => undefined;
    apiPath = (): string => (this.constructor as typeof Serializable).API_PATH();
    apiPathWithId(): string { return `${this.apiPath()}/${this.id}` }
    acceptedChildren = (): (typeof Serializable)[] => [];
    css = computed(() => 'primary' as string);

    @Exclude() track_id: number = nextTrackId();
    class: string = '';
    created_at: string = '';
    deleted_at: string = '';
    flags: number = 0;
    id: string = '';
    params?: Dictionary;
    updated_at: string = '';
    @Transform(({ value }) => deepCopy(value)) var: Dictionary<any> = {};

    #actions: NxAction[] | undefined;
    get actions(): NxAction[] { return this.#actions ??= this.buildActions() }
    set actions(_: NxAction[]) { this.#actions = _; }
    protected buildActions(): NxAction[] { return [] }

    @Exclude() httpService: HttpWrapper = nx()?.service;

    liveSyncEnabled = false;

    isDirty = computed((): boolean => { this.snapshot(); return baselineFor(this) !== this.#baseline; });
    createdAt = computed((): Dayjs => dayjs(this.snapshot().created_at as string));
    updatedAt = computed((): Dayjs => dayjs(this.snapshot().updated_at as string));
    getModelName = computed((): string => BACKEND_MODEL_NAMESPACE + this.snapshot().class);

    markerClass = Marker.CLASS(this);
    markerActions = Marker.ACTIONS(this);

    #state = signal<any>({}, { equal: () => false });
    readonly snapshot = this.#state.asReadonly();

    readonly getName: Signal<string> = computed(() => { this.snapshot(); return (this as { name?: string }).name ?? '' });
    readonly getBadge: Signal<Badge|undefined> = signal<Badge|undefined>(undefined);
    readonly getAvatar: Signal<string> = computed(() => resolveIconUrl(this.snapshot().icon, 'nexus/icon'));
    readonly getTooltip: Signal<string> = computed(() => this.getName());

    #baseline: string | undefined;


    static fromJson<T>(this: new () => T, json: unknown = {}): T {
        if ((this as unknown) === Serializable) {
            console.trace('Serializable.fromJson() called on the abstract base class directly - find the caller below and use a concrete model instead', json);
        }
        const d = (json ?? {}) as Dictionary;
        const instance = untracked(() => hydrate(new this() as object, d)) as T & { afterDeserialize?: (data: Dictionary) => void };
        instance.afterDeserialize?.(d);
        return instance;
    }

    fromJson(json: unknown = {}): this {
        if ((this.constructor as unknown) === Serializable) {
            console.trace('Serializable#fromJson() called on a bare base-class instance - find the caller below and use a concrete model instead', json);
        }
        untracked(() => hydrate(this, json));
        this.afterDeserialize(json);
        return this;
    }

    afterDeserialize(json: unknown, seen?: WeakSet<Serializable>): void {
        initNestedSerializables(this, json, seen);
        untracked(() => {
            this.captureBaseline();
            this.#state.set(json);
        });
        LiveModelRegistry.register(this);
    }

    setBadge(badge: Badge|undefined): void { (this.getBadge as WritableSignal<Badge|undefined>).set(badge); }

    #merge(json: object): void { this.#state.update((d) => Object.assign({}, d, json)); }

    snapshotAsThis(): Partial<this> { return this.snapshot() as Partial<this> }

    patch(json: Partial<this> | Dictionary): void { Object.assign(this, json); this.#merge(json); }

    store(changes?: Dictionary, silent = false): Observable<this> { return Persistence.store(this, changes, silent) }
    refresh(): Observable<this> { return Persistence.refresh(this) }
    update(changes?: Dictionary, silent = false): Observable<this> { return Persistence.update(this, changes, silent) }
    delete(): Observable<this> { return Persistence.remove(this) }

    showParam(key: string, data: Dictionary = {}): Observable<unknown> { return Params.show(this, key, data) }
    updateParam(key: string, changes: Dictionary): Observable<unknown> { return Params.write(this, key, changes) }
    removeParam(paramName: string): Observable<unknown> { return Params.remove(this, paramName) }
    getParamPath(key: string): string { return Params.paramPath(this, key) }
    getParam(key: string, def?: string): string | undefined { return Params.read<string>(this, key, def) }
    getFloatParam(key: string, def?: number): number | undefined { return Params.read<number>(this, key, def) }

    toPayload(hidden: string[] = []): Dictionary { return jsonSafe(nx().payloadFor(this, this.constructor as typeof Serializable, hidden)) ?? {} }
    captureBaseline(): void { this.#baseline = baselineFor(this); }

    dirtyFields(): Dictionary {
        const diff = changedFields(this.toPayload(), this.#baseline);
        this.captureBaseline();
        return diff;
    }

    acceptsChild(_: Serializable): boolean { return this.acceptedChildren().some((x) => x === _.constructor) }
    setParent = (_: Serializable) => console.error('setParent() not implemented for class ' + this.class);
    navigateTo(url: string): void { Ui.navigateTo(url); }
    nxSelect<T extends Serializable>(predicate: (_: T) => boolean): void { Ui.selectWith(predicate); }
    getService<T>(_: ProviderToken<T>): T { return Ui.getService(_) }
    isClass(c: string): boolean { return this.class === c }
    assert<T>(c: Type<T>): T | undefined { return this instanceof c ? (this as unknown as T) : undefined }
    hasFlag(bit: number): boolean { return (this.flags & bit) !== 0 }

    modalConfirm(title: string = 'Attention', text: string = 'Do you really want to delete?'): Promise<boolean> { return Ui.confirm(title, text) }
    modalInput(title: string): Promise<ModalInputResult | undefined> { return Ui.promptInput(title) }

    getClone<T extends Serializable>(): T {
        try {
            const clone = cloneOf<T>(this);
            (clone as Serializable).#state.set(this.snapshot());
            (clone as Serializable).#baseline = this.#baseline;
            return clone;
        } catch (e) {
            console.error(e);
            return this as unknown as T;
        }
    }

}
