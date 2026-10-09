import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgbModalOptions, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { modelListResource } from '@models/http/model-resource';
import { WebhookDelivery } from '@models/webhook/webhook-delivery.model';
import { WebhookEndpoint } from '@models/webhook/webhook-endpoint.model';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { RelativeTimePipe } from '@pipes/relative-time.pipe';

@Component({
    selector: 'modal-webhook-deliveries',
    templateUrl: './modal-webhook-deliveries.component.html',
    imports: [DatePipe, NgbTooltipModule, SpinnerComponent, EmptyStateComponent, RelativeTimePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModalWebhookDeliveriesComponent extends ModalBaseComponent<void> {
    static override modalOptions: NgbModalOptions = { size: 'xl', scrollable: true };

    readonly endpoint = signal<WebhookEndpoint | undefined>(undefined);
    readonly expanded = signal<string | undefined>(undefined);
    readonly #deliveries = modelListResource(
        () => this.endpoint()?.id,
        () => this.endpoint()!.deliveries(),
    );
    readonly deliveries = this.#deliveries.value;
    readonly loading = this.#deliveries.isLoading;

    init(endpoint: WebhookEndpoint): void {
        this.endpoint.set(endpoint);
    }

    onSuccess = (): void => undefined;

    reload = () => this.#deliveries.reload();

    toggle(delivery: WebhookDelivery) {
        this.expanded.update((uuid) => (uuid === delivery.uuid ? undefined : delivery.uuid));
    }
}
