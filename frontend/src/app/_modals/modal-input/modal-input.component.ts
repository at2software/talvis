import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NgbActiveModal, NgbModalOptions } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { SafePipe } from '@pipes/safe.pipe';
import { ModalBaseComponent } from '../modal-base.component';
import { ModalInputResult } from '@models/_core/modal-results';

export interface ModalInputArgs {
    title: string;
    message?: string;
    initialValue?: string;
    hasMore?: boolean;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-input',
    templateUrl: './modal-input.component.html',
    imports: [FormsModule, HotkeyDirective, SafePipe],
})
export class ModalInputComponent extends ModalBaseComponent<ModalInputResult> {
    static override modalOptions: NgbModalOptions = { size: 'lg' };

    modalTitle = '';
    result = '';
    hasMore = signal(false);
    infoMessage?: string;
    required = true;

    #activeModal = inject(NgbActiveModal);

    init(args: ModalInputArgs): void {
        this.modalTitle = args.title;
        this.infoMessage = args.message;
        if (args.hasMore !== undefined) this.hasMore.set(args.hasMore);
        if (args.initialValue !== undefined) {
            this.result = args.initialValue;
            this.required = false;
        }
    }
    get canAccept() {
        return !this.required || this.result.trim() !== '';
    }
    submit = () => {
        if (this.canAccept) this.accept();
    };
    onSuccess(): ModalInputResult {
        return { text: this.result, more: false };
    }
    // `accept` (ok) and `decline`/`dismiss` (cancel -> undefined) come from the base.
    more = () => this.#activeModal.close({ text: this.result, more: true });
}
