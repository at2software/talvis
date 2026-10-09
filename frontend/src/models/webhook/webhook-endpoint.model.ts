import { Serializable } from '@models/_core/serializable';
import { Model } from '@constants/model/type-discriminators';
import { NxAction } from '@models/_core/nx.actions';
import { MODAL } from '@models/_core/modal-registry';
import { nx } from '@models/_core/nx-bridge';
import { Toast } from '@shards/toast/toast';
import { firstValueFrom, map, Observable, tap } from 'rxjs';
import { WebhookDelivery } from './webhook-delivery.model';
import { getWebhookEndpointActions } from './webhook-endpoint.actions';

const toDelivery = (json: unknown): WebhookDelivery => WebhookDelivery.fromJson(json);

@Model('WebhookEndpoint')
export class WebhookEndpoint extends Serializable {
    static API_PATH = (): string => 'webhook-endpoints';

    protected override buildActions(): NxAction[] { return getWebhookEndpointActions(this) }

    name: string = '';
    url: string = '';
    is_active: boolean = true;
    failure_count: number = 0;
    last_delivered_at: string | null = null;
    last_failed_at: string | null = null;
    created_by_id?: string;
    secret?: string;

    hasFailures = (): boolean => this.failure_count > 0;

    openEdit = (): Promise<WebhookEndpoint | undefined> => nx().openModal<WebhookEndpoint>(MODAL.editWebhookEndpoint, this);
    openDeliveries = (): Promise<unknown> => nx().openModal(MODAL.webhookDeliveries, this);

    setActive = (active: boolean): Observable<this> => this.update({ is_active: active });

    deliveries = (): Observable<WebhookDelivery[]> => this.httpService.aget(`${this.apiPathWithId()}/deliveries`, {}, toDelivery);

    ping = (): Observable<WebhookDelivery> =>
        this.httpService.post(`${this.apiPathWithId()}/ping`, {}, toDelivery).pipe(
            tap((delivery) => {
                if (delivery.isDelivered()) Toast.success($localize`:@@i18n.webhooks.pingDelivered:test event delivered`);
                else Toast.warn($localize`:@@i18n.webhooks.pingFailed:test event failed` + `: ${delivery.errorSummary()}`);
            }),
        );

    revealSecret = (): Observable<string> =>
        this.httpService.get<{ secret: string }>(`${this.apiPathWithId()}/secret`).pipe(
            map((_) => _.secret),
            tap((secret) => (this.secret = secret)),
        );

    rotateSecret = (): Promise<string> =>
        this.modalConfirm(
            $localize`:@@i18n.common.attention:attention`,
            $localize`:@@i18n.webhooks.reallyRotate:rotate the signing secret? The current secret stops working immediately.`,
        ).then(() =>
            firstValueFrom(
                this.httpService.post<{ secret: string }>(`${this.apiPathWithId()}/secret`).pipe(
                    map((_) => _.secret),
                    tap((secret) => (this.secret = secret)),
                ),
            ),
        );

    confirmDelete = (): Promise<this> =>
        this.modalConfirm(
            $localize`:@@i18n.common.attention:attention`,
            $localize`:@@i18n.webhooks.reallyDelete:really delete this webhook? Pending deliveries are discarded.`,
        ).then(() => firstValueFrom(this.delete()));
}
