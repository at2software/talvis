import { NxActionType } from '@models/_core/nx.actions';
import { UptimeMonitor } from './uptime-monitor.model';
import { firstValueFrom } from 'rxjs';

export const getUptimeMonitorActions = (self: UptimeMonitor) => [
    { title: $localize`:@@i18n.uptime.runTest:run test`, action: () => self.runTest(), group: true },
    { title: $localize`:@@i18n.common.edit:edit`, action: () => self.openEdit(), group: true },
    { title: $localize`:@@i18n.uptime.subscribe:subscribe`, on: () => !self.isSubscribed(), action: () => self.subscribe(), group: true },
    { title: $localize`:@@i18n.uptime.unsubscribe:unsubscribe`, on: () => self.isSubscribed(), action: () => self.unsubscribe(), group: true },
    { title: $localize`:@@i18n.uptime.unlinkFromProject:unlink from project`, context: 'project-dashboard', action: () => self.unlinkFromProject(), group: true, type: NxActionType.Destructive, roles: 'project_manager' },
    { title: $localize`:@@i18n.common.delete:delete`, action: () => self.modalConfirm().then(() => firstValueFrom(self.delete())), group: true, type: NxActionType.Destructive, roles: 'admin' },
];
