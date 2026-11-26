import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Connection } from './connection.model';
import { firstValueFrom } from 'rxjs';

const EDITORS = 'project_manager|marketing';

export function getConnectisingleActionResolveds(self: Connection): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.connections.setType:set relationship...`,
            roles: EDITORS,
            children: () => [
                ...Connection.TYPES.filter((_) => _.key !== self.type).map((_) => ({ title: _.label, action: () => self.update({ type: _.key }) })),
                ...(self.type ? [{ title: $localize`:@@i18n.connections.unclassified:unclassified`, action: () => self.update({ type: null }) }] : []),
            ],
        },
        {
            title: $localize`:@@i18n.connections.reverse:reverse direction`,
            roles: EDITORS,
            on: () => !!self.typeOption()?.directed,
            action: () => self.update({ reverse: true }),
        },
        {
            title: $localize`:@@i18n.connections.openSource:open source`,
            on: () => !!self.source_url,
            action: () => window.open(self.source_url!, '_blank', 'noopener'),
        },
        {
            title: $localize`:@@i18n.customers.deleteConnection:delete connection`,
            doubleClick: true,
            action: () => self.modalConfirm().then(() => firstValueFrom(self.delete())),
            type: NxActionType.Destructive,
            group: true,
            hotkey: 'CTRL+DELETE',
            roles: 'admin',
        },
    ];
}
