import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgbModalOptions, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { finalize } from 'rxjs';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { HotkeyDirective } from '@directives/hotkey.directive';
import { WebhookEndpoint } from '@models/webhook/webhook-endpoint.model';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Toast } from '@shards/toast/toast';

@Component({
    selector: 'modal-edit-webhook-endpoint',
    templateUrl: './modal-edit-webhook-endpoint.component.html',
    imports: [FormsModule, NgbTooltipModule, HotkeyDirective, SpinnerComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalEditWebhookEndpointComponent extends ModalBaseComponent<WebhookEndpoint> {
    static override modalOptions: NgbModalOptions = { size: 'lg' };

    readonly isNew = signal(true);
    readonly created = signal(false);
    readonly saving = signal(false);
    readonly name = signal('');
    readonly url = signal('');
    readonly isActive = signal(true);
    readonly secret = signal<string | undefined>(undefined);
    readonly canSave = computed(() => !!this.name().trim() && !!this.url().trim());

    #endpoint = new WebhookEndpoint();

    init(endpoint?: WebhookEndpoint): void {
        if (!endpoint) return;
        this.#endpoint = endpoint;
        this.isNew.set(false);
        this.name.set(endpoint.name);
        this.url.set(endpoint.url);
        this.isActive.set(endpoint.is_active);
    }

    onSuccess = (): WebhookEndpoint => this.#endpoint;

    save() {
        if (!this.canSave()) return;
        const payload = { name: this.name().trim(), url: this.url().trim(), is_active: this.isActive() };
        this.saving.set(true);
        if (this.isNew()) {
            this.#endpoint
                .store(payload)
                .pipe(finalize(() => this.saving.set(false)))
                .subscribe((endpoint) => {
                    this.secret.set(endpoint.secret);
                    this.created.set(true);
                });
        } else {
            this.#endpoint
                .update(payload)
                .pipe(finalize(() => this.saving.set(false)))
                .subscribe(() => this.accept());
        }
    }

    revealSecret() {
        this.#endpoint.revealSecret().subscribe((secret) => this.secret.set(secret));
    }

    rotateSecret() {
        this.#endpoint
            .rotateSecret()
            .then((secret) => this.secret.set(secret))
            .catch(() => undefined);
    }

    copySecret() {
        const secret = this.secret();
        if (!secret) return;
        navigator.clipboard
            .writeText(secret)
            .then(() => Toast.success($localize`:@@i18n.webhooks.secretCopied:secret copied to the clipboard`))
            .catch(console.error);
    }
}
