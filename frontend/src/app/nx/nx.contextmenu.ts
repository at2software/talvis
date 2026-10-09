import { ChangeDetectionStrategy, Component, DestroyRef, afterNextRender, ElementRef, Renderer2, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NxAction } from '@models/_core/nx.actions';
import { ContextMenuTrigger, NxService } from './nx.service';
import { NgbDropdown, NgbDropdownMenu } from '@ng-bootstrap/ng-bootstrap';
import { AutopositionDirective } from '@directives/autoposition.directive';
import { NxDropdown } from './nx.dropdown';
import { SelectionService } from './selection.service';
import { Serializable } from '@models/_core/serializable';
import { Nx } from './nx.directive';

type NxHost = HTMLElement & { nx?: Nx };

const TRIGGER_SIZE = 22;
const TRIGGER_MIN_HOST_WIDTH = 160;
const TRIGGER_MIN_HOST_HEIGHT = 18;
const TRIGGER_ANCHOR_HEIGHT = 40;const INTERACTIVE = 'button, a[href], input, select, textarea, label, [role="button"], .btn, .form-check, .form-switch';

@Component({
    selector: 'nx-contextmenu',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: 'nx.contextmenu.html',
    imports: [NxDropdown, NgbDropdown, NgbDropdownMenu],
    host: { '(window:keydown)': 'onDocumentKeyDown($event)' },
    styles: [
        `
            .nx-row-trigger {
                position: fixed;
                z-index: 1040;
                display: none;
                align-items: center;
                justify-content: center;
                width: ${TRIGGER_SIZE}px;
                height: ${TRIGGER_SIZE}px;
                padding: 0;
                border: none;
                background: none;
                color: var(--bs-emphasis-color);
                cursor: pointer;
            }
            .nx-row-trigger:hover {
                color: var(--bs-primary);
            }
            .nx-row-trigger.visible {
                display: flex;
            }
            .nx-row-trigger i {
                font-size: 16px;
                line-height: 1;
            }
        `,
    ],
})
export class NxContextMenu {
    private readonly ngbDropdown = viewChild.required(NgbDropdown);
    private readonly dropdown = viewChild.required('dropdown', { read: ElementRef });
    private readonly rowTrigger = viewChild.required<ElementRef<HTMLButtonElement>>('rowTrigger');

    readonly actions = signal<NxAction[]>([]);

    #service = inject(NxService);
    #re = inject(Renderer2);
    #selection = inject(SelectionService);
    #triggerHost?: NxHost;
    #button?: HTMLButtonElement;

    constructor() {
        this.#service.onContextMenu.pipe(takeUntilDestroyed()).subscribe(e => this.#onNewContextMenu(e));
        this.#bindRowTrigger();
    }

    onDocumentKeyDown = (event: KeyboardEvent) => this.#service.onDocumentKeyDown(event);

    #onNewContextMenu = (e: ContextMenuTrigger) => {
        this.ngbDropdown()?.close();
        if (e.objects.length === 0) return console.error('no objects selected');

        const firstNx = e.objects[0].nx();
        this.#selection.setContext(firstNx instanceof Serializable ? firstNx : undefined);

        const sameClass = e.objects.every(_ => _.nx().class === firstNx.class);
        if (!sameClass) return console.error('different classes have been selected');

        this.actions.set(NxService.filteredActions(e.objects));

        const el = this.dropdown().nativeElement;
        this.#re.setStyle(el, 'left', e.event.clientX - 20 + 'px');
        this.#re.setStyle(el, 'top', e.event.clientY - 20 + 'px');

        this.ngbDropdown().open();
        setTimeout(() => AutopositionDirective.reposition(this.dropdown(), this.#re));
    };

    #bindRowTrigger() {
        const onOver = (e: MouseEvent) => this.#button && this.#onPointerOver(e, this.#button);
        const onTriggerClick = (e: MouseEvent) => this.#onTriggerClick(e);
        const hide = () => this.#hideTrigger();
        afterNextRender(() => {
            this.#button = this.rowTrigger().nativeElement;
            this.#button.addEventListener('click', onTriggerClick);
            document.addEventListener('mouseover', onOver, { passive: true });
            document.addEventListener('scroll', hide, { capture: true, passive: true });
            window.addEventListener('resize', hide, { passive: true });
        });
        inject(DestroyRef).onDestroy(() => {
            this.#button?.removeEventListener('click', onTriggerClick);
            document.removeEventListener('mouseover', onOver);
            document.removeEventListener('scroll', hide, { capture: true });
            window.removeEventListener('resize', hide);
        });
    }

    #onPointerOver(e: MouseEvent, button: HTMLButtonElement) {
        const target = e.target as Element | null;
        if (!target || button.contains(target)) return;
        if (e.buttons) return this.#hideTrigger();
        if (this.#triggerHost && target.closest('.nx') === this.#triggerHost) return;
        const host = this.#findTriggerHost(target);
        if (!host) return this.#hideTrigger();
        if (host !== this.#triggerHost) this.#showTrigger(host, button);
    }

    #findTriggerHost(target: Element): NxHost | undefined {
        let host = target.closest<NxHost>('.nx');
        while (host) {
            if (host.closest('.nx-no-trigger, .modal, .dropdown-menu')) return undefined;
            const rect = host.getBoundingClientRect();
            if (host.nx && rect.width >= TRIGGER_MIN_HOST_WIDTH && rect.height >= TRIGGER_MIN_HOST_HEIGHT) {
                return host.nx.nx().actions?.length ? host : undefined;
            }
            host = host.parentElement?.closest<NxHost>('.nx') ?? null;
        }
        return undefined;
    }

    #showTrigger(host: NxHost, button: HTMLButtonElement) {
        const rect = host.getBoundingClientRect();
        const left = rect.right - TRIGGER_SIZE - 4;
        const top = rect.top + (Math.min(rect.height, TRIGGER_ANCHOR_HEIGHT) - TRIGGER_SIZE) / 2;
        const covered = document
            .elementsFromPoint(left + TRIGGER_SIZE / 2, top + TRIGGER_SIZE / 2)
            .find(_ => _ !== button && !button.contains(_));
        const interactive = covered?.closest(INTERACTIVE);
        if (interactive && interactive !== host && host.contains(interactive)) return this.#hideTrigger();

        this.#triggerHost = host;
        button.style.left = left + 'px';
        button.style.top = top + 'px';
        button.classList.add('visible');
    }

    #hideTrigger() {
        if (!this.#triggerHost) return;
        this.#triggerHost = undefined;
        this.#button?.classList.remove('visible');
    }

    #onTriggerClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        const host = this.#triggerHost;
        this.#hideTrigger();
        if (host?.nx && host.isConnected) this.#service.onRightClick(host.nx, e);
    }
}
