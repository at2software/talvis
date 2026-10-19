import { inject, Service } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { firstValueFrom } from 'rxjs';
import { GlobalService } from '@models/global.service';
import { UserService } from '@models/user/user.service';
import { PluginEntryDto } from '@models/_core/api-response';
import { PluginConfigModalComponent } from './plugin-config-modal/plugin-config-modal.component';

export const CALENDAR_CONNECTOR = $localize`:@@i18n.profile.calendarConnector:iCal / WebDAV calendar`;

@Service()
export class ConnectorService {
    #modalService = inject(NgbModal);
    #userService = inject(UserService);
    #global = inject(GlobalService);

    async create(type: string, displayName: string): Promise<boolean> {
        const plugin = { type, displayName, value: undefined, my_id: null, id: null } as unknown as PluginEntryDto;
        const modalRef = this.#modalService.open(PluginConfigModalComponent, { size: 'lg' });
        modalRef.componentInstance.plugin = plugin;
        modalRef.componentInstance.isNewPlugin.set(true);

        const result = await modalRef.result.catch(() => undefined);
        if (result !== 'save') return false;
        await firstValueFrom(this.#userService.encrypt(type, plugin.value));
        this.#global.reload();
        return true;
    }
}
