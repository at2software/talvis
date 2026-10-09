import { NxAction } from '@models/_core/nx.actions';
import { nx } from '@models/_core/nx-bridge';
import { WebhookEndpoint } from './webhook-endpoint.model';

export function getWebhookEndpointActions(self: WebhookEndpoint): NxAction[] {
    return [
        { title: $localize`:@@i18n.common.edit:edit`, doubleClick: true, roles: 'admin', action: () => self.openEdit() },
        { title: $localize`:@@i18n.webhooks.ping:send test event`, roles: 'admin', action: () => self.ping() },
        { title: $localize`:@@i18n.webhooks.deliveries:deliveries`, roles: 'admin', action: () => self.openDeliveries().then(() => self) },
        nx().deleteAction(self, $localize`:@@i18n.webhooks.reallyDelete:really delete this webhook? Pending deliveries are discarded.`, { roles: 'admin' }),
    ];
}
