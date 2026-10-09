import { Type, signal, Service } from '@angular/core';
import { ActivityTabComponent } from './activity-tab.component';
import { ActivityComponent } from './activity.component';

@Service()
export class ActivityService {
    setContainer!: (value: ActivityComponent | PromiseLike<ActivityComponent>) => void;

    tabs = signal<ActivityTabComponent[]>([]);
    activeTabIndex = signal(0);

    #currentUniqueId = 0;
    #container!: ActivityComponent;
    #onContainer: Promise<ActivityComponent> = new Promise<ActivityComponent>((resolve) => (this.setContainer = resolve));
    #timeout?: ReturnType<typeof setTimeout>;

    getCurrentUniqueId = (): number => ++this.#currentUniqueId;

    addTab(tab: ActivityTabComponent): void {
        this.#onContainer.then((container) => {
            this.#container = container;
            this.#container.re.appendChild(this.#container.content().nativeElement, tab.el.nativeElement);
            this.tabs.update(t => [...t, tab]);
            this.tabs().forEach((_, k) => _.prepare(k));
            if (this.tabs().length === 1) this.setActiveTab(0);
            this.activateLatestTab();
        });
    }

    removeTab(tab: ActivityTabComponent): void {
        this.#onContainer.then((c) => {
            this.tabs.update(t => t.filter(x => x !== tab));
            this.tabs().forEach((_, k) => _.prepare(k));
            c.re.removeChild(c.content().nativeElement, tab.el.nativeElement);
            this.activateLatestTab();
        });
    }

    activateLatestTab() {
        clearTimeout(this.#timeout);
        this.#timeout = setTimeout(() => {
            this.#timeout = undefined;
            const latest = this.tabs().filter((tab) => !tab.hidden()).at(-1);
            if (latest) this.focus(latest);
        }, 250);
    }

    focus(tab: ActivityTabComponent) {
        const index = this.tabs().indexOf(tab);
        if (index !== -1) this.setActiveTab(index);
    }

    setActiveTab(index: number) {
        this.tabs().forEach((tab) => tab.el.nativeElement.classList.remove('active', 'show'));
        if (this.tabs()[index]) {
            this.tabs()[this.activeTabIndex()]?.onBlur();
            this.tabs()[index].el.nativeElement.classList.add('active', 'show');
            this.tabs()[index].onFocus();
            this.activeTabIndex.set(index);
        }
    }

    switchToTabByComponent(componentType: Type<unknown>): boolean {
        const index = this.tabs().findIndex((tab) => tab.componentType() === componentType);
        if (index !== -1) { this.setActiveTab(index); return true; }
        return false;
    }

    switchToTabByIcon(icon: string): boolean {
        const index = this.tabs().findIndex((tab) => tab.icon() === icon || tab.nicon() === icon);
        if (index !== -1) { this.setActiveTab(index); return true; }
        return false;
    }

    switchToTab(index: number) {
        if (index >= 0 && index < this.tabs().length) this.setActiveTab(index);
    }
}
