import { signal, Service } from '@angular/core';
import { storageGet, storageSet } from '@constants/storage';

@Service()
export class ActivitySidebarStateService {
    readonly #STORAGE_KEY = 'activity-sidebar-collapsed';

    readonly #collapsedSignal = signal(false);
    readonly collapsed = this.#collapsedSignal.asReadonly();

    constructor() {
        this.#restoreSidebarState();
        new MutationObserver(() => this.#collapsedSignal.set(this.isCollapsed()))
            .observe(document.body, { attributes: true, attributeFilter: ['class'] });
        this.#collapsedSignal.set(this.isCollapsed());
    }

    toggleSidebar(): void {
        const isCollapsed = document.body.classList.contains('activity-collapsed');

        if (isCollapsed) {
            document.body.classList.remove('activity-collapsed');
            this.#saveSidebarState(false);
        } else {
            document.body.classList.add('activity-collapsed');
            this.#saveSidebarState(true);
        }
    }

    applyViewport(narrow: boolean): void {
        document.body.classList.toggle('activity-hidden', narrow);
        document.body.classList.toggle('activity-collapsed', narrow || storageGet<boolean | null>(this.#STORAGE_KEY, null) === true);
    }

    #saveSidebarState(isCollapsed: boolean): void {
        storageSet(this.#STORAGE_KEY, isCollapsed);
    }

    #restoreSidebarState(): void {
        const savedState = storageGet<boolean | null>(this.#STORAGE_KEY, null);
        if (savedState === true) {
            document.body.classList.add('activity-collapsed');
        } else if (savedState === false) {
            document.body.classList.remove('activity-collapsed');
        }
    }

    isCollapsed(): boolean {
        return document.body.classList.contains('activity-collapsed');
    }
}
