import { inject, Service } from '@angular/core';
import { TalvisHttpService } from '../http/http.talvis';
import { BehaviorSubject } from 'rxjs';
import { Router, NavigationEnd } from '@angular/router';
import { WebSocketService, MousePosition, SharingStatus, MouseClick, QuickMessage } from '@services/websocket.service';
import { GlobalService } from '../global.service';
import { filter } from 'rxjs/operators';
import { getCookie, setCookie } from '@constants/cookies';
import { storageGet, storageSet } from '@constants/storage';

export interface ActiveSharing {
    userId: string;
    userName: string;
    userColor: string;
    url: string;
    visible?: boolean;
}

@Service()
export class LiveSharingService extends TalvisHttpService<any> {
    apiPath = 'live-sharing';
    #ws = inject(WebSocketService);
    #router = inject(Router);
    #global = inject(GlobalService);

    featureEnabled$ = new BehaviorSubject<boolean>([true, 1, '1'].includes(storageGet<boolean | number | string>('live_sharing_feature', false)));
    sharingEnabled$ = new BehaviorSubject<boolean>(false);
    activeSharings$ = new BehaviorSubject<ActiveSharing[]>([]);
    currentUrl$ = new BehaviorSubject<string>('');
    mousePositionsOnCurrentUrl$ = new BehaviorSubject<Map<string, MousePosition>>(new Map());
    mouseClicks$ = new BehaviorSubject<MouseClick[]>([]);

    #mousePositionMap = new Map<string, MousePosition>();
    #messageTimeouts = new Map<string, any>();

    constructor() {
        super();

        this.#router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event: NavigationEnd) => {
            const normalizedUrl = this.#normalizeUrl(event.urlAfterRedirects);
            this.currentUrl$.next(normalizedUrl);
            this.#filterMousePositionsForCurrentUrl(normalizedUrl);

            if (this.sharingEnabled$.value) this.toggleSharing(true);
        });

        this.#ws.mousePositions$.subscribe((pos) => this.#handleMousePosition(pos));
        this.#ws.sharingToggled$.subscribe((status) => this.#handleSharingToggled(status));
        this.#ws.visibilityChanged$.subscribe((change) => this.#handleVisibilityChanged(change));
        this.#ws.mouseClicks$.subscribe((click) => this.#handleMouseClick(click));
        this.#ws.quickMessages$.subscribe((msg) => this.#handleQuickMessage(msg));

        this.#global.init.subscribe(() => {
            this.loadActiveSharings();
            const cookieSharing = getCookie('live_sharing') === '1';
            if (cookieSharing) {
                this.toggleSharing(true);
            }
        });
    }

    toggleFeature(enabled: boolean) {
        storageSet('live_sharing_feature', enabled);
        this.featureEnabled$.next(enabled);
        if (!enabled && this.sharingEnabled$.value) {
            this.toggleSharing(false);
        }
    }

    toggleSharing(enabled: boolean) {
        setCookie('live_sharing', enabled ? '1' : '0', 30);
        this.sharingEnabled$.next(enabled);
        const url = this.#normalizeUrl(this.#router.url);

        const user = this.#global.user;
        if (!user) {
            this.post('live-sharing/toggle', { enabled, url }).subscribe();
            return;
        }

        const currentSharings = this.activeSharings$.value;

        if (enabled) {
            this.#upsertSharing(currentSharings, {
                userId: user.id,
                userName: user.getName(),
                userColor: user.color || '#3B82F6',
                url,
            });
        } else {
            this.activeSharings$.next(currentSharings.filter((s) => s.userId !== user.id));
        }

        this.post('live-sharing/toggle', { enabled, url }).subscribe();
    }

    sendMousePosition(x: number, y: number) {
        if (!this.sharingEnabled$.value) return;

        const url = this.#normalizeUrl(this.#router.url);
        this.#ws.sendMousePosition(x, y, url);
    }

    loadActiveSharings() {
        this.get<ActiveSharing[]>('live-sharing/active').subscribe((sharings) => {
            this.activeSharings$.next(sharings);
        });
    }

    #handleMousePosition(pos: MousePosition) {
        if (pos.userId === this.#global.user?.id) return;

        this.#mousePositionMap.set(pos.userId, pos);
        this.#filterMousePositionsForCurrentUrl(this.currentUrl$.value);
    }

    #handleSharingToggled(status: SharingStatus) {
        const currentSharings = this.activeSharings$.value;

        if (!status.enabled) {
            this.activeSharings$.next(currentSharings.filter((s) => s.userId !== status.userId));
            this.#mousePositionMap.delete(status.userId);
            this.#filterMousePositionsForCurrentUrl(this.currentUrl$.value);
            return;
        }

        this.#upsertSharing(currentSharings, {
            userId: status.userId,
            userName: status.userName,
            userColor: status.userColor,
            url: status.url,
            visible: status.visible ?? true,
        });
    }

    #upsertSharing(sharings: ActiveSharing[], sharing: ActiveSharing) {
        const existingIndex = sharings.findIndex((s) => s.userId === sharing.userId);
        if (existingIndex >= 0) {
            sharings[existingIndex] = sharing;
        } else {
            sharings.push(sharing);
        }
        this.activeSharings$.next([...sharings]);
    }

    #handleVisibilityChanged(change: { userId: string; visible: boolean; url: string }) {
        const currentSharings = this.activeSharings$.value;
        const existingIndex = currentSharings.findIndex((s) => s.userId === change.userId);

        if (existingIndex >= 0) {
            currentSharings[existingIndex].visible = change.visible;
            this.activeSharings$.next([...currentSharings]);
        }

        const mousePos = this.#mousePositionMap.get(change.userId);
        if (mousePos) {
            mousePos.visible = change.visible;
            this.#filterMousePositionsForCurrentUrl(this.currentUrl$.value);
        }
    }

    #filterMousePositionsForCurrentUrl(currentUrl: string) {
        const filtered = new Map<string, MousePosition>();

        this.#mousePositionMap.forEach((pos, userId) => {
            const normalizedPosUrl = this.#normalizeUrl(pos.url);
            if (normalizedPosUrl === currentUrl) {
                filtered.set(userId, pos);
            }
        });

        this.mousePositionsOnCurrentUrl$.next(filtered);
    }

    #normalizeUrl(url: string): string {
        return url.split('?')[0].split('#')[0];
    }

    navigateToUserUrl(url: string) {
        this.#router.navigateByUrl(url);
    }

    sendMouseClick(x: number, y: number) {
        if (!this.sharingEnabled$.value) return;

        const url = this.#normalizeUrl(this.#router.url);
        this.#ws.sendMouseClick(x, y, url);
    }

    sendQuickMessage(message: string) {
        if (!this.sharingEnabled$.value) return;

        this.#ws.sendQuickMessage(message);
    }

    #handleMouseClick(click: MouseClick) {
        if (click.userId === this.#global.user?.id) return;

        const normalizedUrl = this.#normalizeUrl(click.url);
        if (normalizedUrl !== this.currentUrl$.value) return;

        this.mouseClicks$.next([...this.mouseClicks$.value, click]);

        setTimeout(() => {
            this.mouseClicks$.next(this.mouseClicks$.value.filter((c) => c !== click));
        }, 1000);
    }

    #handleQuickMessage(msg: QuickMessage) {
        if (msg.userId === this.#global.user?.id) return;

        const mousePos = this.#mousePositionMap.get(msg.userId);
        if (!mousePos) return;

        clearTimeout(this.#messageTimeouts.get(msg.userId));

        mousePos.message = msg.message;
        this.#filterMousePositionsForCurrentUrl(this.currentUrl$.value);

        const timeout = setTimeout(() => {
            const pos = this.#mousePositionMap.get(msg.userId);
            if (pos) {
                delete pos.message;
                this.#filterMousePositionsForCurrentUrl(this.currentUrl$.value);
            }
            this.#messageTimeouts.delete(msg.userId);
        }, 3000);

        this.#messageTimeouts.set(msg.userId, timeout);
    }
}
