import { inject, Signal, signal, Service } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { firstValueFrom, Observable, tap } from 'rxjs';
import { GlobalService } from '@models/global.service';
import { Serializable } from '@models/_core/serializable';
import { LiveModelRegistry } from '@models/live/live-model-registry';
import { WebSocketService } from '@services/websocket.service';
import { Toast } from '@shards/toast/toast';

@Service()
export abstract class DetailGuard<T extends Serializable> {

    #global = inject(GlobalService);
    #router = inject(Router);
    #ws = inject(WebSocketService);

    abstract observable: (id: string) => Observable<T>;
    protected onBeforeLoad() { /** overridden by children */ }
    protected async onLoaded(_: T) { /** overridden by children */ }

    #objectSignal = signal<T>(null as unknown as T, { equal: () => false });
    readonly object: Signal<T> = this.#objectSignal.asReadonly();

    touch = () => this.#objectSignal.set(this.object());

    constructor() {
        LiveModelRegistry.updated$.subscribe((instance) => {
            if (instance === this.object()) this.touch();
        });
        this.#ws.reconnected$.subscribe(() => this.reload());
    }

    show = (id: string): Observable<T> => {
        this.onBeforeLoad();
        return this.observable(id).pipe(
            tap((_: T) => {
                _.liveSyncEnabled = true;
                this.#objectSignal.set(_);
                this.onLoaded(_);
            }),
        );
    };

    reload = () =>
        this.object()?.refresh().subscribe((_) => {
            const result = _ as T;
            result.liveSyncEnabled = true;
            this.#objectSignal.set(result);
            this.onLoaded(result);
        });

    async canActivate(route: ActivatedRouteSnapshot): Promise<boolean> {
        const id = route.paramMap.get('id');
        if (!id) return false;
        try {
            const result = await firstValueFrom(this.show(id));
            this.#global.registerSelectedObject(result);
            return true;
        } catch (error) {
            const status = (error as { status?: number })?.status;
            Toast.error(
                status === 429
                    ? $localize`:@@i18n.common.tooManyRequests:too many requests - please wait a moment and try again`
                    : $localize`:@@i18n.common.loadFailed:could not load the requested entry`,
            );
            console.error(`${this.constructor.name}: failed to load id ${id}`, error);
            return false;
        }
    }

    canActivateChild(route: ActivatedRouteSnapshot): boolean | UrlTree {
        const navData = route.data['nav'];

        if (!navData) {
            return true;
        }

        const pathSegments: string[] = [];
        let currentRoute: ActivatedRouteSnapshot | null = route.parent;

        while (currentRoute) {
            if (currentRoute.url.length > 0) {
                pathSegments.unshift(...currentRoute.url.map((segment) => segment.path));
            }
            currentRoute = currentRoute.parent;
        }

        const parentPath = '/' + pathSegments.join('/');

        if (navData.roles) {
            const requiredRoles = navData.roles.split('|');
            if (!this.#global.user?.hasAnyRole(requiredRoles)) {
                return this.#router.parseUrl(parentPath);
            }
        }

        if (navData.visibleWhen && !navData.visibleWhen(this.object())) {
            return this.#router.parseUrl(parentPath);
        }
        return true;
    }

    static routeActivators() {
        return {
            canActivate: [this],
            canActivateChild: [this],
            title: (): string => inject(this).object()?.getName() ?? '',
        };
    }
}
