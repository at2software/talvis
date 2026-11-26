import type { NxAction } from '@models/_core/nx.actions';
import { CompanyContact } from '../company/company-contact.model';
import { Serializable } from '@models/_core/serializable';
import { User } from '../user/user.model';
import { PluginInstance } from '../http/plugins/plugin.instance';
import { nx } from '@models/_core/nx-bridge';
import { getAssigneeActions } from './assignee.actions';
import { TypeFromClass, Model } from '@constants/model/type-discriminators';
import { computed, Type } from '@angular/core';

export const CONTACT_ONLY_ROLES: string[] = ['customer', 'external contributor'];
export const ROLE_GLYPHS: Record<string, { glyph: string; color: string }> = {
    'project manager': { glyph: 'manage_accounts', color: 'orange' },
    'developer': { glyph: 'code', color: 'cyan' },
    'lead developer': { glyph: 'architecture', color: 'cyan' },
    'security': { glyph: 'shield', color: 'purple' },
    'ui/ux': { glyph: 'palette', color: 'pink' },
    'customer': { glyph: 'storefront', color: 'muted' },
    'external contributor': { glyph: 'handshake', color: 'muted' },
};
export const roleGlyph = (role: string): string => ROLE_GLYPHS[role]?.glyph ?? 'label';
export const roleTextClass = (role: string): string => `text-${ROLE_GLYPHS[role]?.color ?? 'muted'}`;

export const I18N_REMOVE_FROM_TEAM = $localize`:@@i18n.project.removeFromTeam:remove from team`;

@Model('Assignee')
export class Assignee extends Serializable {
    static API_PATH = (): string => 'assignments';

    override readonly getName = computed(() => { this.snapshot(); return this.assignee?.getName() || ''; });

    protected override buildActions(): NxAction[] { return getAssigneeActions(this) }

    role_ids: number[] = [];
    duration: string = '';
    assignee_id: string = '';
    parent_id: string = '';
    user_id: string = '';
    company_contact_id: string = '';
    company_id: string = '';
    hours_planned: number = 0;
    hours_weekly: number = 0;
    avg_hpd: number = 0;

    @TypeFromClass() assignee!: CompanyContact | User;

    getUser = () => this.assignee as User;

    hasRoleId = (roleId: number): boolean => this.role_ids.includes(roleId);
    addRole = (roleId: number) => this.update({ role_ids: [...this.role_ids, roleId] });
    removeRole = (roleId: number) => this.update({ role_ids: this.role_ids.filter((_) => _ !== roleId) });

    isUser = () => this.assignee?.class === 'User';
    roles = (): string[] => nx().global.assignment_roles.filter((_) => this.hasRoleId(_.id)).map((_) => _.name);
    role = (): string => this.roles().join(', ');
    route() {
        if (this.apiPath() == 'companies') return '/customers/' + this.id;
        return '/' + this.apiPath() + '/' + this.id;
    }

    canLinkTo = <T extends PluginInstance>(pluginType: Type<T>): boolean => {
        return this.assignee?.canLinkToInstance(pluginType) ?? false;
    };

    linkTo = <T extends PluginInstance, S extends PluginInstance = T>(pluginType: Type<T>, subPluginType?: Type<S>) => {
        this.assignee?.linkToInstance(pluginType, subPluginType);
    };

    getLinkablePlugins = () => (this.assignee as { getLinkableRootInstances?: () => PluginInstance[] })?.getLinkableRootInstances?.() ?? [];
    linkToPlugin = (instance: PluginInstance) => (this.assignee as { linkToPlugin?: (i: PluginInstance) => void })?.linkToPlugin?.(instance);

    static newU = (u: User) => Assignee.fromJson({ assignee: u, user_id: u.id });
    static newC = (u: CompanyContact) => Assignee.fromJson({ assignee: u, company_contact_id: u.id });
}
