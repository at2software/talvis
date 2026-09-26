import { NxAction } from '@models/_core/nx.actions';
import { Encryption } from './encryption.model';
import { firstValueFrom } from 'rxjs';

export function getEncryptisingleActionResolveds(self: Encryption): NxAction[] {
    return [{ title: $localize`:@@i18n.common.delete:delete`, action: () => self.modalConfirm().then(() => firstValueFrom(self.delete())), group: true, hotkey: 'CTRL+DELETE' }];
}
