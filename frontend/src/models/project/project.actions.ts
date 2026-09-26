import { NxAction, NxActionType } from '@models/_core/nx.actions';
import { nx, TBroadcast } from '@models/_core/nx-bridge';
const i18n1Week = $localize`:@@i18n.common.1week:1 week`;
const i18nNWeeks = (count: number) => $localize`:@@i18n.common.nweeks:${count} weeks`;
const i18n1Month = $localize`:@@i18n.common.1month:1 month`;
const i18nNMonths = (count: number) => $localize`:@@i18n.common.nmonths:${count} months`;
import { Company } from '@models/company/company.model';
import { ConnectionProjects } from '@models/company/connection-projects.model';
import { CompanyContact } from '@models/company/company-contact.model';
import { VcardRow } from '@models/vcard/vcard-row';
import { Project } from './project.model';
import { MODAL } from '@models/_core/modal-registry';
import { ModalInputResult } from '@models/_core/modal-results';
import { firstValueFrom, tap } from 'rxjs';

const POSTPONE_DURATIONS = [
    { title: i18n1Week, duration: 1 },
    { title: i18nNWeeks(2), duration: 2 },
    { title: i18n1Month, duration: 3 },
    { title: i18nNMonths(2), duration: 4 },
    { title: i18nNMonths(3), duration: 5 },
    { title: i18nNMonths(6), duration: 6 },
    { title: i18nNMonths(12), duration: 7 },
];

export const getProjectActions = (self: Project) => [
    { title: $localize`:@@i18n.common.open:open`, doubleClick: true, action: () => self.navigateTo(self.frontendUrl()) },
    ...nx().clipboardActions(self),
    {
        title: $localize`:@@i18n.project.duplicate:duplicate project`,
        group: true,
        roles: 'project_manager',
        interrupt: { service: MODAL.input, args: { title: $localize`:@@i18n.project.duplicateName:name for the duplicated project`, get initialValue() { return self.name; } } },
        action: (_a: unknown, _b: unknown, interruptResult: ModalInputResult | undefined) => {
            const name = interruptResult?.text?.trim();
            if (name) self.duplicate(name);
        },
    },
    {
        title: $localize`:@@i18n.common.makeRootProject:make root project`,
        group: true,
        on: (): boolean => (self.project_id ? true : false),
        action: () => self.update({ project_id: null }),
    },
    {
        title: $localize`:@@i18n.common.setState:set state`,
        group: true,
        children: () => nx().global.getAllowedSucceedingProjectStatesFor(self).map((state) => ({ title: state.name, group: true, action: () => self.setState({ state: state.id }) })),
    },
    {
        title: $localize`:@@i18n.project.extendReminder:extend reminder`,
        on: () => '' + nx().global.user?.getParam('PROJECTS_POSTPONE_WITH_COMMENT') !== '1',
        group: true,
        children: () =>
            POSTPONE_DURATIONS.map(({ title, duration }) => ({
                title,
                group: true,
                action: () => self.postpone(duration),
            })),
    },
    {
        title: $localize`:@@i18n.project.extendReminder:extend reminder`,
        on: () => '' + nx().global.user?.getParam('PROJECTS_POSTPONE_WITH_COMMENT') === '1',
        group: true,
        children: () => {
            return POSTPONE_DURATIONS.map(({ title, duration }) => ({
                title: title + ' 💬',
                group: true,
                interrupt: { service: MODAL.input, args: { title: $localize`:@@i18n.project.postponeComment:Comment for postponing` } },
                action: (_a: unknown, _b: unknown, interruptResult: { text: string }) => self.postpone(duration, undefined, interruptResult.text),
            }));
        },
    },
    {
        title: $localize`:@@i18n.project.setProjectManager:set project manager`,
        on: () => !self.project_manager_id,
        group: true,
        children: nx().global.team
            .filter((_) => !_.is_retired && (_.role_names.includes('project_manager') || _.role_names.includes('admin')))
            .map((user) => ({
                title: user.getName(),
                group: true,
                type: (context?: string) => context === 'widget-missing-project-manager' ? NxActionType.Destructive : undefined,
                action: () => self.update({ project_manager_id: user.id }),
            })),
    },
    {
        title: $localize`:@@i18n.project.addParticipant:add participant...`,
        group: true,
        on: (): boolean => {
            const currentRoot = nx().getCurrentRoot();
            if (!currentRoot) return false;
            const company = currentRoot instanceof Company ? currentRoot : currentRoot instanceof Project ? currentRoot.company : null;
            if (!company) return false;
            return (company?.available_connections?.length ?? 0) > 0;
        },
        children: () => {
            const currentRoot = nx().getCurrentRoot();
            if (!currentRoot) return [];
            const company = currentRoot instanceof Company ? currentRoot : currentRoot instanceof Project ? currentRoot.company : null;
            return (company?.available_connections ?? []).map((connection: ConnectionProjects) => ({
                title: connection.other_company.getName(),
                group: true,
                action: () => self.addParticipant(connection.connection_id),
            }));
        },
    },
    {
        title: $localize`:@@i18n.common.selectAll:select all...`,
        children: [{ title: $localize`:@@i18n.common.ofCustomer:...of customer`, unselectsingleActionResolved: false, hotkey: 'CTRL+ALT+C', action: () => self.nxSelect((_: Project) => _.company_id == self.company_id) }],
    },
    {
        title: $localize`:@@i18n.project.removeFromWidget:remove from widget`,
        context: 'widgetPreparedInvoices',
        action: () => self.modalConfirm('Attention', 'do you really want to ignore this project from invoice preparation?').then(() => firstValueFrom(self.update({ is_ignored_from_prepared: true }))),
        group: true,
        type: NxActionType.Destructive,
        roles: 'admin',
    },
    {
        title: $localize`:@@i18n.project.noGitRequired:no git required`,
        on: () => !self.no_git_required,
        group: true,
        action: () => self.update({ no_git_required: true }).pipe(tap(() => nx().broadcast({ type: TBroadcast.Update, data: self }))),
    },
    {
        title: $localize`:@@i18n.project.undoNoGitRequired:undo: no git required`,
        on: () => !!self.no_git_required,
        group: true,
        action: () => self.update({ no_git_required: false }).pipe(tap(() => nx().broadcast({ type: TBroadcast.Update, data: self }))),
    },
    {
        title: 'Contact...',
        group: true,
        on: () => getContactActions(self).length > 0,
        children: () => getContactActions(self),
    },
    ...self.markerActions(),
    {
        title: $localize`:@@i18n.common.delete:delete`,
        action: () => self.modalConfirm().then(() => firstValueFrom(self.delete())),
        group: true,
        type: NxActionType.Destructive,
        hotkey: 'CTRL+DELETE',
        roles: 'admin',
    },
];

function getContactActions(self: Project): NxAction[] {
    const contacts: CompanyContact[] = self.assigned_contacts ?? [];
    const projectName: string = self.name;
    return contacts.flatMap((cc: CompanyContact) => {
        const actions: NxAction[] = [];
        const name: string = cc.getName() || cc.contact.card()?.name || 'Contact';
        const card = cc.card();
        (card?.get('TEL') ?? []).forEach((p: VcardRow) => {
            actions.push({
                title: `Call ${name}`,
                group: true,
                action: () => window.open(`tel:${p.val().replace(/\s|,|\/-/g, '')}`),
            });
            if (typeof p.isMobile === 'function' && p.isMobile()) {
                actions.push({
                    title: `Whatsapp message ${name}`,
                    group: true,
                    action: () =>
                        window.open(
                            `https://web.whatsapp.com/send/?phone=${p
                                .val()
                                .replace(/\s|,|\/-/g, '')
                                .replace(/^\+/g, '')}&text&type=phone_number&app_absent=0`,
                            'whatsappweb',
                        ),
                });
            }
        });
        (card?.get('EMAIL') ?? []).forEach((p: VcardRow) => {
            actions.push({
                title: `Email ${name}`,
                group: true,
                action: () => window.open(`mailto:${p.val()}?subject=${encodeURIComponent(projectName)}`),
            });
        });
        return actions;
    });
}
