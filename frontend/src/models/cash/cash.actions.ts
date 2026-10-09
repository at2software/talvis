import { NxAction } from '@models/_core/nx.actions';
import { Cash } from './cash.model';
import { MODAL } from '@models/_core/modal-registry';
import { nx } from '@models/_core/nx-bridge';

export function getCashActions(self: Cash): NxAction[] {
    return [
        { title: $localize`:@@i18n.common.edit:edit`, doubleClick: true, roles: 'financial', action: () => nx().openModal(MODAL.editCash, self) },
        { title: $localize`:@@i18n.cash.invertSign:invert sign`, roles: 'financial', action: () => self.update({ value: -self.value }) },
        nx().deleteAction(self, $localize`:@@i18n.cash.reallyDeleteThisEntry:really delete this entry?`, { roles: 'financial' }),
    ];
}
