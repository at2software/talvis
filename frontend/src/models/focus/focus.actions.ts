import { NxAction } from '@models/_core/nx.actions';
import { Focus } from './focus.model';
import { MODAL } from '@models/_core/modal-registry';
import { ExtIssueLinkResult } from '@models/_core/modal-results';
import { nx } from '@models/_core/nx-bridge';

export function getFocusActions(self: Focus): NxAction[] {
    return [
        {
            title: $localize`:@@i18n.common.edit:edit`,
            doubleClick: true,
            action: () => nx().openModal(MODAL.editFocus, self),
        },
        ...nx().clipboardActions(self),
        {
            title: $localize`:@@i18n.issues.linkExternalIssue:link external issue`,
            group: true,
            interrupt: { service: MODAL.linkExtIssue, args: self },
            action: (_resolve, _ctx, result: ExtIssueLinkResult | undefined) =>
                result ? self.update({ ext_issue_plugin_link_id: result.ext_issue_plugin_link_id, ext_issue_id: result.ext_issue_id }) : undefined,
        },
        { title: $localize`:@@i18n.foci.resetToOrga:reset to organisational`, action: () => self.update({ project_id: null }), roles: 'hr' },
        {
            title: $localize`:@@i18n.foci.enableInvoicing:enable invoicing`,
            on: () => !self.invoice_item_id && self.is_unpaid,
            action: () => self.update({ is_unpaid: false }),
            group: true,
            roles: 'project_manager|financial',
        },
        {
            title: $localize`:@@i18n.foci.disableInvoicing:disable invoicing`,
            on: () => !self.invoice_item_id && !self.is_unpaid,
            action: () => self.update({ is_unpaid: true }),
            group: true,
            roles: 'project_manager|financial',
        },
        {
            title: $localize`:@@i18n.common.selectAll:select all...`,
            children: [
                {
                    title: $localize`:@@i18n.common.ofComment:...of comment`,
                    unselectsingleActionResolved: false,
                    hotkey: 'CTRL+C',
                    action: () =>
                        self.nxSelect(
                            (_: Focus) =>
                                (_.comment ?? '')
                                    .trim()
                                    .toLowerCase()
                                    .localeCompare((self.comment ?? '').trim().toLowerCase()) == 0,
                        ),
                },
            ],
        },
        ...self.markerActions(),
        {
            title: 'Assign',
            group: true,
            on: () => !!(nx().global.userFor(self.user_id)?.latest_foci?.length),
            children: () => {
                const user = nx().global.userFor(self.user_id);
                return (user?.latest_foci ?? []).map((_: any) => ({
                    title: _.parent_name,
                    group: true,
                    action: () => self.update({ parent_path: _.parent_path }),
                }));
            },
        },
        nx().deleteAction(self, $localize`:@@i18n.common.reallyDeleteThisFocus:really delete this focus?`, { roles: 'admin' }),
    ];
}
