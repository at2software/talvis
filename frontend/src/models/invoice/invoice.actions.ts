import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Invoice } from './invoice.model';
import { nx } from '@models/_core/nx-bridge';
import { firstValueFrom } from 'rxjs';

export function getInvoiceActions(self: Invoice): NxAction[] {
    const navigateAfterInvoiceAction = (projectId?: string) => {
        if (projectId) {
            self.navigateTo('projects/' + projectId + '/invoicing');
            return;
        }
        self.navigateTo('customers/' + self.company.id + '/billing');
    };

    return [
        { title: $localize`:@@i18n.common.open:open`, doubleClick: true, action: () => self.navigateTo(self.frontendUrl()) },
        { title: $localize`:@@i18n.invoice.sendMail:send mail`, action: () => self.sendMail(), on: () => !self.paid_at },
        { title: $localize`:@@i18n.invoice.sendReminder:send reminder`, action: () => self.sendReminder(), on: () => self.needs_reminder() },
        { title: $localize`:@@i18n.invoice.markPaid:mark paid`, group: true, on: () => !self.paid_at, action: () => self.setPaid() },
        { title: $localize`:@@i18n.invoice.markUnpaid:mark unpaid`, group: true, on: () => (self.paid_at ? true : false), action: () => self.setUnpaid() },
        {
            title: $localize`:@@i18n.invoice.cancel:cancel`,
            action: () =>
                self.modalConfirm($localize`:@@i18n.invoice.confirmCancel:Are you sure you want to cancel this invoice? This will create a cancellation invoice.`).then(async () => {
                    await firstValueFrom(self.cancel());
                    const projectItem = self.invoice_items?.find((item) => item.project_id);
                    navigateAfterInvoiceAction(projectItem?.project_id);
                    return self;
                }),
        },
        {
            title: $localize`:@@i18n.invoice.undo:undo`,
            on: () => self.isLatestInvoice(),
            type: NxActionType.Destructive,
            action: () =>
                self.modalConfirm($localize`:@@i18n.invoice.confirmUndo:Are you sure you want to undo this invoice?`).then(async () => {
                    const response = (await firstValueFrom(self.undo())) as any;
                    nx().global.settings['INVOICE_NO_CURRENT'] = response.INVOICE_NO_CURRENT;
                    navigateAfterInvoiceAction(response?.item?.project_id);
                    return self;
                }),
        },
        ...self.markerActions(),
        { title: $localize`:@@i18n.invoice.sendToDatev:send to DATEV`, context: 'invoice.module.table', on: () => nx().global.setting('DATEV_MAIL_OUTGOING'), group: true, action: () => self.sendToDatev() },
    ];
}
