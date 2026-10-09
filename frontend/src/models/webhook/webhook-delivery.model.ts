import { Serializable } from '@models/_core/serializable';
import { Model } from '@constants/model/type-discriminators';

@Model('WebhookDelivery')
export class WebhookDelivery extends Serializable {
    static API_PATH = (): string => 'webhook-deliveries';

    uuid: string = '';
    event: string = '';
    payload: unknown = null;
    attempts: number = 0;
    next_attempt_at: string | null = null;
    delivered_at: string | null = null;
    response_status: number | null = null;
    last_error: string | null = null;

    isDelivered = (): boolean => !!this.delivered_at;
    isPending = (): boolean => !this.delivered_at && !!this.next_attempt_at;
    isFailed = (): boolean => !this.delivered_at && !this.next_attempt_at;
    hasError = (): boolean => this.response_status !== null || !!this.last_error;
    errorSummary = (): string => [this.response_status ? `HTTP ${this.response_status}` : '', this.last_error ?? ''].filter(Boolean).join(' · ');
    prettyPayload = (): string => JSON.stringify(this.payload, null, 2);
}
