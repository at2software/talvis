import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { finalize } from 'rxjs';
import { Nx } from '@app/nx/nx.directive';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalEditWebhookEndpointComponent } from '@app/_modals/modal-edit-webhook-endpoint/modal-edit-webhook-endpoint.component';
import { modelListResource } from '@models/http/model-resource';
import { WebhookEndpoint } from '@models/webhook/webhook-endpoint.model';
import { WebhookEndpointService } from '@models/webhook/webhook-endpoint.service';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { RelativeTimePipe } from '@pipes/relative-time.pipe';

@Component({
    selector: 'settings-webhooks',
    templateUrl: './settings-webhooks.component.html',
    imports: [DatePipe, NgbTooltipModule, Nx, EmptyStateComponent, SpinnerComponent, RelativeTimePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsWebhooksComponent {
    readonly specUrl = 'https://www.standardwebhooks.com/';

    #service = inject(WebhookEndpointService);
    #modalService = inject(ModalBaseService);

    readonly #endpoints = modelListResource(() => this.#service.index());
    readonly endpoints = this.#endpoints.value;
    readonly loading = this.#endpoints.isLoading;
    readonly pinging = signal<string | undefined>(undefined);

    reload = () => this.#endpoints.reload();

    create() {
        this.#modalService.open(ModalEditWebhookEndpointComponent).then(this.reload);
    }

    edit(endpoint: WebhookEndpoint) {
        endpoint.openEdit().then(this.reload);
    }

    setActive(endpoint: WebhookEndpoint, active: boolean) {
        endpoint.setActive(active).subscribe({ next: this.reload, error: this.reload });
    }

    ping(endpoint: WebhookEndpoint) {
        this.pinging.set(endpoint.id);
        endpoint
            .ping()
            .pipe(finalize(() => this.pinging.set(undefined)))
            .subscribe({ next: this.reload, error: this.reload });
    }

    remove(endpoint: WebhookEndpoint) {
        endpoint
            .confirmDelete()
            .then(this.reload)
            .catch(() => undefined);
    }
}
