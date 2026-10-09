import type { NxAction } from '@models/_core/nx.actions';
import { CompanyContact } from '../company/company-contact.model';
import { Serializable } from '@models/_core/serializable';
import { User } from '../user/user.model';
import { PluginInstance } from '../http/plugins/plugin.instance';
import { getAssigneeActions } from './assignee.actions';
import { TypeFromClass, Model } from '@constants/model/type-discriminators';
import { computed, Type } from '@angular/core';

export const I18N_REMOVE_FROM_TEAM = $localize`:@@i18n.project.removeFromTeam:remove from team`;

@Model('Assignee')
export class Assignee extends Serializable {
    static API_PATH = (): string => 'assignments';

    override readonly getName = computed(() => { this.snapshot(); return this.assignee?.getName() || ''; });

    protected override buildActions(): NxAction[] { return getAssigneeActions(this) }

    role_id: number = 0;
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

    setRole = (role: number) => {
        this.role_id = role;
        this.update();
    };

    isUser = () => this.assignee?.class === 'User';
    role = () => ({ 1: 'Project Manager', 2: 'Developer', 3: 'Customer' }[this.role_id] ?? '');
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
