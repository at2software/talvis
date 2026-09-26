import { NxAction } from '@models/_core/nx.actions';
import { CompanyContact } from './company-contact.model';
import { nx } from '@models/_core/nx-bridge';

export function getCompanyContactActions(self: CompanyContact): NxAction[] {
    return [
        { title: $localize`:@@i18n.common.edit:edit`, doubleClick: true, action: () => self.navigateTo(self.frontendUrl()) },
        {
            title: $localize`:@@i18n.plugins.linkToPluginUser:link to plugin user`,
            group: true,
            on: () => self.getLinkableRootInstances().length > 0,
            children: () => self.getLinkableRootInstances().map((inst) => ({
                title: `link to ${inst.icon()} user`,
                action: () => self.linkToPlugin(inst),
            })),
        },
        { title: $localize`:@@i18n.common.retire:retire`, group: true, on: () => !self.isRetired(), action: () => self.update({ is_retired: true }), roles: 'project_manager|marketing' },
        { title: $localize`:@@i18n.common.reactivate:reactivate`, group: true, on: () => self.isRetired(), action: () => self.update({ is_retired: false }), roles: 'project_manager|marketing' },
        { title: $localize`:@@i18n.companies.setFavorite:set favorite`, group: true, action: () => self.update({ is_favorite: true }), on: () => !self.is_favorite },
        { title: $localize`:@@i18n.companies.setAsDefaultContact:set as default contact`, group: true, action: () => nx().service.put(`companies/${self.company_id}`, { default_contact_id: self.id }) },
        { title: $localize`:@@i18n.companies.setAsInvoiceContact:set as invoice contact`, group: true, action: () => nx().service.put(`companies/${self.company_id}`, { default_invoicee_id: self.id }) },
        { title: $localize`:@@i18n.companies.unsetFavorite:unset favorite`, group: true, action: () => self.update({ is_favorite: false }), on: () => self.is_favorite },
        nx().deleteAction(self, $localize`:@@i18n.companies.reallyDeleteThisContact:really delete this contact?`, { roles: 'admin' }),
    ];
}
