import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { LeadSource } from './lead-source.model';
import { firstValueFrom } from 'rxjs';

export function getLeadSourceActions(self: LeadSource): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.common.delete:delete`,
            doubleClick: true,
            action: () => self.modalConfirm().then(() => firstValueFrom(self.delete())),
            group: true,
            type: NxActionType.Destructive,
            hotkey: 'CTRL+DELETE',
            roles: 'admin',
        },
    ];
}
