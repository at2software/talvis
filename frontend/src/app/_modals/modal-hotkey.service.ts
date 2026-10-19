import { Service } from '@angular/core';
import { HotkeyDirective } from '@directives/hotkey.directive';

const SUBMIT_HOTKEY = 'CTRL+ENTER';
const SUBMIT_TARGETS = [`[hotkey="${SUBMIT_HOTKEY}"]`, 'button[type="submit"]', '.modal-footer .btn-primary'];

@Service()
export class ModalHotkeyService {
    constructor() {
        window.addEventListener('keydown', (event) => this.#onKeydown(event), { capture: true });
    }

    #onKeydown(event: KeyboardEvent): void {
        if (!HotkeyDirective.applies(event, SUBMIT_HOTKEY)) return;
        const modal = [...document.querySelectorAll<HTMLElement>('ngb-modal-window')].at(-1);
        if (!modal) return;

        const target = SUBMIT_TARGETS.map((selector) => modal.querySelector<HTMLButtonElement>(`${selector}:not(:disabled)`)).find(Boolean);
        if (!target) return;
        event.preventDefault();
        event.stopPropagation();
        target.click();
    }
}
