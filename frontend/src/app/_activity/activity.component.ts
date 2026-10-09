import { ChangeDetectionStrategy, Component, ElementRef, Renderer2, computed, inject, viewChild, viewChildren } from '@angular/core';
import { ActivityService } from './activity.service';
import { ActivitySidebarStateService } from './activity-sidebar-state.service';
import { NComponent } from '@shards/n/n.component';
import { NgbTooltip } from '@ng-bootstrap/ng-bootstrap';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'app-activity',
    templateUrl: './activity.component.html',
    styleUrls: ['./activity.component.scss'],
    imports: [NComponent, NgbTooltip],
    host: { '(click)': 'onHostClick($event)' },
})
export class ActivityComponent {
    readonly content = viewChild.required<ElementRef<HTMLElement>>('content');
    readonly buttons = viewChildren<ElementRef<HTMLElement>>('buttonRef');
    readonly srv = inject(ActivityService);
    readonly re = inject(Renderer2);
    readonly #el = inject(ElementRef);
    readonly #sidebarStateService = inject(ActivitySidebarStateService);

    readonly collapsed = this.#sidebarStateService.collapsed;
    readonly toggleLabel = computed(() => (this.collapsed() ? $localize`:@@i18n.common.expand:expand` : $localize`:@@i18n.common.minimize:minimize`));
    readonly visibleIndexes = computed(() => this.srv.tabs().flatMap((tab, i) => (tab.hidden() ? [] : [i])));

    constructor() {
        this.srv.setContainer(this);
    }

    toggle() {
        this.#sidebarStateService.toggleSidebar();
    }

    select(index: number) {
        this.srv.setActiveTab(index);
        if (this.collapsed()) this.toggle();
    }

    onHostClick(event: MouseEvent) {
        if (event.target === this.#el.nativeElement && !this.collapsed()) this.toggle();
    }

    onTabKeydown(event: KeyboardEvent) {
        const visible = this.visibleIndexes();
        const position = visible.indexOf(this.srv.activeTabIndex());
        const next = visible[(position + 1) % visible.length];
        const previous = visible.at(position - 1);
        const target = ({
            ArrowRight: next,
            ArrowDown: next,
            ArrowLeft: previous,
            ArrowUp: previous,
            Home: visible[0],
            End: visible.at(-1),
        } as Record<string, number | undefined>)[event.key];
        if (target === undefined) return;
        event.preventDefault();
        this.srv.setActiveTab(target);
        this.buttons()[target]?.nativeElement.focus();
    }
}
