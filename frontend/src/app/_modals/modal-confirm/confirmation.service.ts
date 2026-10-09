import { ModalConfirmComponent } from './modal-confirm.component';
import { Service, inject } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

export interface ConfirmationArguments {
    title: string;
    message: string;
    btnOkText?: string;
    btnCancelText?: string;
    dialogSize?: 'sm' | 'lg';
}

/**
 * Confirmation gate. Unlike {@link ModalBaseService} (which resolves `undefined`
 * on cancel), `confirm()` intentionally **rejects** when the user cancels, so
 * callers can write `confirm(...).then(() => destructiveAction())` without a guard.
 */
@Service()
export class ConfirmationService {
    #modalService = inject(NgbModal);

    public confirm(args: ConfirmationArguments): Promise<boolean> {
        if (!args.btnOkText) args.btnOkText = $localize`:@@i18n.common.ok:ok`;
        if (!args.btnCancelText) args.btnCancelText = $localize`:@@i18n.common.cancel:cancel`;
        if (!args.dialogSize) args.dialogSize = 'lg';
        const modalRef = this.#modalService.open(ModalConfirmComponent, { size: args.dialogSize });
        modalRef.componentInstance.init(args);
        return new Promise<boolean>((resolve, reject) => {
            modalRef.result
                .then((_) => (_ === true ? resolve(true) : reject(false)))
                .catch(() => reject(false));
        });
    }

    public ask(args: ConfirmationArguments): Promise<boolean> {
        return this.confirm(args).catch(() => false);
    }
}
