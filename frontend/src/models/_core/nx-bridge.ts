import type { ProviderToken } from '@angular/core';
import type { Dictionary } from '@constants/constants';
import type { HttpWrapper } from '../http/http.wrapper';
import type { Serializable } from '@models/_core/serializable';
import type { GlobalService } from '@models/global.service';
import type { NxAction } from './nx.actions';
import type { INxContextMenu } from './nx.contextmenu.interface';
import type { ModalRef } from './modal-registry';
import type { ModalInputResult } from './modal-results';

export enum TBroadcast {
    Update,
    Delete,
}

export interface BroadcastPayload {
    type: TBroadcast;
    data: Serializable;
}

export interface DeleteActionOptions {
    roles?: string | null;
    on?: () => boolean;
    action?: () => void;
}

export interface NxSelectionBridge {
    selectWith<T extends Serializable>(predicate: (_: T) => boolean): void;
    selected: { nx(): INxContextMenu }[];
}

export interface NxBridge {
    readonly service: HttpWrapper;
    readonly global: GlobalService;
    readonly nxService: NxSelectionBridge;
    readonly context?: Serializable;
    readonly ME_ID: string;
    broadcast(payload: BroadcastPayload): void;
    payloadFor(obj: Serializable, ctor: typeof Serializable, hidden?: string[]): Dictionary;
    navigateTo(url: string): void;
    getService<T>(token: ProviderToken<T>): T;
    getCurrentRoot(): Serializable | undefined;
    deleteAction(self: Serializable, message: string | (() => string), options?: DeleteActionOptions): NxAction;
    clipboardActions(self: Serializable, addContext?: string): NxAction[];
    openModal<R = unknown>(ref: ModalRef, ...args: unknown[]): Promise<R | undefined>;
    confirm(title: string, message: string): Promise<boolean>;
    promptInput(text: string, hasMore?: boolean, infoMessage?: string, initialValue?: string): Promise<ModalInputResult | undefined>;
}

let bridge: NxBridge | undefined;

export const setNxBridge = (_: NxBridge): void => void (bridge = _);

export const nx = (): NxBridge => bridge as NxBridge;
