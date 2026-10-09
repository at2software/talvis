import { ChangeDetectionStrategy, Component, computed, inject, Service, signal, viewChild } from '@angular/core';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { NewUserFormComponent } from '@shards/new-user-form/new-user-form.component';

export interface NewUserData {
    name: string;
    email: string;
    password: string;
}

@Component({
    selector: 'modal-new-user',
    templateUrl: './modal-new-user.component.html',
    imports: [HotkeyDirective, NewUserFormComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalNewUserComponent {
    name = signal('');
    email = signal('');
    password = signal('');
    error = '';

    #activeModal = inject(NgbActiveModal);

    readonly form = viewChild(NewUserFormComponent);
    readonly canSubmit = computed(() => this.form()?.valid() ?? false);

    decline = () => this.#activeModal.close(undefined);
    accept = () => {
        if (this.canSubmit()) this.#activeModal.close({ name: this.name().trim(), email: this.email().trim(), password: this.password() });
    };
}

@Service()
export class ModalNewUserService {
    #modalService = inject(NgbModal);

    open = () => this.#modalService.open(ModalNewUserComponent, { size: 'md' }).result;
}
