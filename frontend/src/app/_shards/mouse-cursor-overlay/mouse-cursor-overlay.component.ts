import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { LiveSharingService } from '@models/live/live-sharing.service';
import { Subject, fromEvent, throttleTime } from 'rxjs';
import { MousePosition, MouseClick, WebSocketService } from '@services/websocket.service';
import { Router } from '@angular/router';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'mouse-cursor-overlay',
    imports: [],
    template: `
        @for (cursor of cursors(); track cursor.userId) {
            <div class="remote-cursor" [class.off-tab]="cursor.visible === false" [style.left.px]="getViewportX(cursor.x)" [style.top.px]="getViewportY(cursor.y)">
                <svg width="24" height="24" viewBox="0 0 24 24" [attr.fill]="cursor.userColor">
                    <path d="M3 3L10.07 19.97L12.58 12.58L19.97 10.07L3 3Z" />
                </svg>
                <span class="username-label" [class.message-mode]="cursor.message" [style.background-color]="cursor.userColor">
                    {{ cursor.message || cursor.userName }}
                </span>
            </div>
        }

        @for (click of clicks(); track $index) {
            <div class="click-animation" [style.left.px]="getViewportX(click.x)" [style.top.px]="getViewportY(click.y)">
                <div class="click-circle" [style.border-color]="click.userColor"></div>
            </div>
        }
    `,
    styles: [
        `
            :host {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 9999;
            }

            .remote-cursor {
                position: absolute;
                pointer-events: none;
                transition:
                    left 0.1s ease-out,
                    top 0.1s ease-out,
                    opacity 0.3s ease-out;
                transform: translate(-2px, -2px);
                opacity: 1;
            }

            .remote-cursor.off-tab {
                opacity: 0.3;
            }

            .remote-cursor svg {
                filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
            }

            .username-label {
                position: absolute;
                left: 24px;
                top: 0;
                padding: 2px 6px;
                border-radius: var(--bs-border-radius);
                color: white;
                font-size: 11px;
                font-weight: 500;
                white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                transition: font-size 0.2s ease-out;
            }

            .username-label.message-mode {
                font-size: 16.5px;
            }

            .click-animation {
                position: absolute;
                pointer-events: none;
                transform: translate(-50%, -50%);
            }

            .click-circle {
                width: 40px;
                height: 40px;
                border: 3px solid;
                border-radius: 50%;
                animation: clickPulse 1s ease-out forwards;
            }

            @keyframes clickPulse {
                0% {
                    transform: scale(0.5);
                    opacity: 1;
                }
                100% {
                    transform: scale(1.5);
                    opacity: 0;
                }
            }
        `,
    ],
})
export class MouseCursorOverlayComponent {
    #liveSharingService = inject(LiveSharingService);
    #wsService = inject(WebSocketService);
    #router = inject(Router);
    #inputModal = inject(InputModalService);
    #destroyRef = inject(DestroyRef);
    #mouseMove$ = new Subject<{ x: number; y: number; event: MouseEvent }>();

    cursors = signal<MousePosition[]>([]);
    clicks = signal<MouseClick[]>([]);
    #isVisible = true;
    #visibilityChangeHandler = () => this.#onVisibilityChange();
    #scrollHandler = () => this.#updateCursorPositions();

    constructor() {
        this.#liveSharingService.mousePositionsOnCurrentUrl$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((positionsMap) => {
            this.cursors.set(Array.from(positionsMap.values()));
        });

        this.#liveSharingService.mouseClicks$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((clicks) => {
            this.clicks.set(clicks);
        });

        this.#mouseMove$.pipe(throttleTime(100), takeUntilDestroyed(this.#destroyRef)).subscribe(({ x, y, event }: { x: number; y: number; event: MouseEvent }) => {
            const scrollOffsets = this.#getScrollOffsets(event);
            this.#liveSharingService.sendMousePosition(x + scrollOffsets.x, y + scrollOffsets.y);
        });

        document.addEventListener('visibilitychange', this.#visibilityChangeHandler);
        window.addEventListener('blur', this.#visibilityChangeHandler);
        window.addEventListener('focus', this.#visibilityChangeHandler);
        window.addEventListener('scroll', this.#scrollHandler, true);

        this.#destroyRef.onDestroy(() => {
            document.removeEventListener('visibilitychange', this.#visibilityChangeHandler);
            window.removeEventListener('blur', this.#visibilityChangeHandler);
            window.removeEventListener('focus', this.#visibilityChangeHandler);
            window.removeEventListener('scroll', this.#scrollHandler, true);
        });

        fromEvent<MouseEvent>(document, 'mousemove')
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe((event) => {
                if (this.#liveSharingService.sharingEnabled$.value) {
                    this.#mouseMove$.next({ x: event.clientX, y: event.clientY, event });
                }
            });

        fromEvent<MouseEvent>(document, 'click')
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe((event) => {
                if (this.#liveSharingService.sharingEnabled$.value) {
                    const scrollOffsets = this.#getScrollOffsets(event);
                    this.#liveSharingService.sendMouseClick(event.clientX + scrollOffsets.x, event.clientY + scrollOffsets.y);
                }
            });

        fromEvent<KeyboardEvent>(document, 'keydown')
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe((event) => {
                if (!event.ctrlKey || event.key !== 'm' || !this.#liveSharingService.sharingEnabled$.value) return;
                event.preventDefault();
                this.#openQuickMessageModal();
            });
    }

    #onVisibilityChange() {
        const visible = document.visibilityState === 'visible' && document.hasFocus();

        if (visible !== this.#isVisible) {
            this.#isVisible = visible;
            if (this.#liveSharingService.sharingEnabled$.value) {
                const url = this.#liveSharingService.currentUrl$.value || this.#router.url;
                this.#wsService.sendVisibilityStatus(visible, url);
            }
        }
    }

    async #openQuickMessageModal() {
        const result = await this.#inputModal.open('Quick Message', false, undefined, '');
        if (result?.text) {
            this.#liveSharingService.sendQuickMessage(result.text);
        }
    }

    #getScrollOffsets(event: MouseEvent): { x: number; y: number } {
        let totalScrollX = window.scrollX;
        let totalScrollY = window.scrollY;

        const element = document.elementFromPoint(event.clientX, event.clientY);
        if (!element) return { x: totalScrollX, y: totalScrollY };

        let currentElement: HTMLElement | null = element as HTMLElement;
        while (currentElement && currentElement !== document.body) {
            if (currentElement.scrollLeft || currentElement.scrollTop) {
                totalScrollX += currentElement.scrollLeft;
                totalScrollY += currentElement.scrollTop;
            }
            currentElement = currentElement.parentElement;
        }
        return { x: totalScrollX, y: totalScrollY };
    }

    getViewportX(absoluteX: number): number {
        return absoluteX - this.#getCurrentScrollX();
    }

    getViewportY(absoluteY: number): number {
        return absoluteY - this.#getCurrentScrollY();
    }

    #getCurrentScrollX(): number {
        let totalScrollX = window.scrollX;
        const allElements = document.querySelectorAll('*');
        allElements.forEach((element) => {
            const el = element as HTMLElement;
            if (el.scrollLeft) {
                totalScrollX += el.scrollLeft;
            }
        });
        return totalScrollX;
    }

    #getCurrentScrollY(): number {
        let totalScrollY = window.scrollY;
        const allElements = document.querySelectorAll('*');
        allElements.forEach((element) => {
            const el = element as HTMLElement;
            if (el.scrollTop) {
                totalScrollY += el.scrollTop;
            }
        });
        return totalScrollY;
    }

    #updateCursorPositions() {
        this.cursors.update((cursors) => [...cursors]);
    }
}
