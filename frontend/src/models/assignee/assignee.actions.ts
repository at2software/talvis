import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { Assignee, CONTACT_ONLY_ROLES, I18N_REMOVE_FROM_TEAM } from './assignee.model';
import { CompanyContact } from '../company/company-contact.model';
import { nx } from '@models/_core/nx-bridge';
import { Project } from '../project/project.model';
import { tap } from 'rxjs';

export function getAssigneeActions(self: Assignee): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.common.edit:edit`,
            doubleClick: true,
            action: () => {
                if (self.isUser()) {
                    self.navigateTo(`/hr/${self.user_id}`);
                } else {
                    self.navigateTo(`/customers/${(self.assignee as CompanyContact).company_id}/contacts/${(self.assignee as CompanyContact).id}`);
                }
            },
        },
        {
            title: $localize`:@@i18n.projects.makeProjectManager:make project manager`,
            group: false,
            on: () => self.isUser(),
            action: () => nx().service.put(`projects/${self.parent_id}`, { project_manager_id: self.assignee_id }).pipe(
                tap(() => {
                    const project = nx().getCurrentRoot();
                    if (project instanceof Project) {
                        project.patch({ project_manager: self.getUser(), project_manager_id: self.assignee_id });
                        project.projectManagerChanged.next();
                    }
                }),
            ),
        },
        {
            title: $localize`:@@i18n.plugins.linkToPluginUser:link to plugin user`,
            group: true,
            on: () => self.getLinkablePlugins().length > 0,
            children: () => self.getLinkablePlugins().map((inst) => ({
                title: `link to ${inst.icon()} user`,
                action: () => self.linkToPlugin(inst),
            })),
        },
        {
            title: I18N_REMOVE_FROM_TEAM,
            group: true,
            label: 'CTRL+DELETE',
            action: () => self.delete(),
            type: NxActionType.Destructive,
            hotkey: 'CTRL+DELETE',
            on: () => (self.isUser() && self.assignee_id === nx().global.user?.id) || (nx().global.user?.hasRole('project_manager') ?? false),
        },
        {
            title: $localize`:@@i18n.assignee.addRole:add role...`,
            on: () => nx().global.user?.hasRole('project_manager') ?? false,
            children: () => nx().global.assignment_roles
                .filter((role) => !self.hasRoleId(role.id) && (!self.isUser() || !CONTACT_ONLY_ROLES.includes(role.name)))
                .map((role) => ({ title: role.name, action: () => self.addRole(role.id) })),
        },
        {
            title: $localize`:@@i18n.assignee.removeRole:remove role...`,
            on: () => (nx().global.user?.hasRole('project_manager') ?? false) && self.role_ids.length > 0,
            children: () => nx().global.assignment_roles
                .filter((role) => self.hasRoleId(role.id))
                .map((role) => ({ title: role.name, action: () => self.removeRole(role.id) })),
        },
    ];
}
