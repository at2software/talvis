import { NxAction } from '@models/_core/nx.actions';
import { User } from './user.model';

export function getUserActions(self: User): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.marketing.unsubscribe_from_initiative:unsubscribe from initiative`,
            context: 'initiative_subscriber',
            action: (_success?: (v: unknown) => void, nxContext?: unknown) => {
                const context = nxContext as { component?: { unsubscribeFromInitiative(id: string): void }; initiative?: unknown } | undefined;
                if (context?.component && context.initiative) context.component.unsubscribeFromInitiative(self.id);
            },
        },
        { title: $localize`:@@i18n.common.retire:retire`, on: () => !self.is_retired, context: '!initiative_subscriber', action: () => self.update({ is_retired: true }), roles: 'hr' },
        {
            title: $localize`:@@i18n.plugins.linkToPluginUser:link to plugin user`,
            group: true,
            context: '!initiative_subscriber',
            on: () => self.getLinkableRootInstances().length > 0,
            children: () => self.getLinkableRootInstances().map((inst) => ({
                title: `link to ${inst.icon()} user`,
                action: () => self.linkToPlugin(inst),
            })),
        },
        {
            title: $localize`:@@i18n.common.assignToGroup:assign to group...`,
            context: '!initiative_subscriber',
            roles: 'admin',
            children: [
                { title: $localize`:@@i18n.common.admin:admin`, action: () => self.update({ user_group: 'admin' }) },
                { title: $localize`:@@i18n.common.projectManager:project manager`, action: () => self.update({ user_group: 'project_manager' }) },
                { title: $localize`:@@i18n.common.developer:developer`, action: () => self.update({ user_group: 'developer' }) },
                { title: $localize`:@@i18n.common.noUserGroup:no user group`, action: () => self.update({ user_group: null }) },
            ],
        },
    ];
}
