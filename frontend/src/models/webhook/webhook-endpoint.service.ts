import { Service } from '@angular/core';
import { TalvisHttpService } from '../http/http.talvis';
import { WebhookEndpoint } from './webhook-endpoint.model';

@Service()
export class WebhookEndpointService extends TalvisHttpService<WebhookEndpoint> {
    apiPath = 'webhook-endpoints';
    override readonly model = WebhookEndpoint;
}
