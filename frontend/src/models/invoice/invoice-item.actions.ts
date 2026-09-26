import { NxAction } from '@models/_core/nx.actions';
import { InvoiceItem } from './invoice-item.model';
import { InvoiceItemService } from './invoice-item.service';
import { InvoiceItemType } from '@enums/invoice-item.type';
import { REPEATING_MULT } from '../expense/expense.model';
import { nx, TBroadcast } from '@models/_core/nx-bridge';
import { MODAL } from '@models/_core/modal-registry';
import { ExtIssueLinkResult, ModalInputResult, AssignProductResult, CombineInvoiceItemsResult } from '@models/_core/modal-results';
import { Company } from '../company/company.model';
import { ProjectService } from '../project/project.service';
import { MilestoneService } from '../milestone/milestone.service';
import { switchMap, tap } from 'rxjs';

export function getInvoiceItemActions(self: InvoiceItem): NxAction[] {
    return [
        { title: $localize`:@@i18n.common.edit:edit`, doubleClick: true, action: (success?: (v: any) => void, nxContext?: any) => self.onEdit(success, nxContext) },
        {
            title: $localize`:@@i18n.common.changeTo:change to...`,
            group: true,
            children: [
                { title: $localize`:@@i18n.common.active:active`, hotkey: 'CTRL+ALT+1', group: true, on: () => self.type < 3, action: () => self.update({ type: InvoiceItemType.Default }) },
                { title: $localize`:@@i18n.common.inactive:inactive`, hotkey: 'CTRL+ALT+2', group: true, on: () => self.type < 3, action: () => self.update({ type: InvoiceItemType.Inactive }) },
                { title: $localize`:@@i18n.invoices.optional:optional`, hotkey: 'CTRL+ALT+3', group: true, on: () => self.type < 3, action: () => self.update({ type: InvoiceItemType.Optional }) },
                { title: $localize`:@@i18n.common.discount:discount`, hotkey: 'CTRL+ALT+4', group: true, on: () => self.type < 3 && self.qty < 0, action: () => self.update({ type: InvoiceItemType.Discount }) },
            ],
        },
        ...nx().clipboardActions(self, '!clipboard'),
        {
            title: $localize`:@@i18n.common.selectAll:select all...`,
            on: () => self.type in REPEATING_MULT,
            children: [{ title: $localize`:@@i18n.common.ofCustomer:...of customer`, hotkey: 'CTRL+ALT+C', action: () => self.nxSelect((_: InvoiceItem) => _.company_id == self.company_id) }],
        },
        {
            title: $localize`:@@i18n.invoices.combine:combine`,
            group: true,
            hotkey: 'CTRL+ALT+M',
            on: () => canCombineSelectedItems(),
            action: (success) => combineSelectedItems(self, success),
        },
        {
            title: $localize`:@@i18n.issues.linkExternalIssue:link external issue`,
            group: true,
            interrupt: { service: MODAL.linkExtIssue, args: self },
            action: (_resolve, _ctx, result: ExtIssueLinkResult | undefined) =>
                result ? self.update({ ext_issue_plugin_link_id: result.ext_issue_plugin_link_id, ext_issue_id: result.ext_issue_id }) : undefined,
        },
        {
            title: $localize`:@@i18n.milestones.addMilestone:add milestone`,
            on: () => !!self.project_id && !self.milestones?.length,
            interrupt: { service: MODAL.input, args: { title: $localize`:@@i18n.common.addMilestone:add milestone`, get initialValue() { return stripHtml(self.text); } } },
            action: (success, _ctx, result: ModalInputResult | undefined) => {
                const name = result?.text?.trim();
                if (!name || !self.project_id) return;
                return nx().getService(ProjectService)
                    .createMilestone(self.project_id, { name })
                    .pipe(
                        switchMap((milestone) =>
                            nx().getService(MilestoneService)
                                .linkInvoiceItem(milestone.id, self.id)
                                .pipe(
                                    tap(() => {
                                        self.milestones = [milestone];
                                        nx().broadcast({ type: TBroadcast.Update, data: self });
                                        success?.(self);
                                    }),
                                ),
                        ),
                    );
            },
        },
        ...self.markerActions(),
        {
            title: $localize`:@@i18n.invoices.assignProductQty:assign product & qty`,
            group: true,
            on: () => self.type !== InvoiceItemType.Header,
            interrupt: { service: MODAL.assignProduct, args: self },
            action: (_success, nxContext: { company?: Company } | undefined, result: AssignProductResult | undefined) => {
                if (!result || (!result.product && !result.qtyFactor)) return;
                if (result.product) self.applyProduct(result.product, nxContext?.company || self.company);
                if (result.qtyFactor && result.qtyFactor !== 1) {
                    const step = result.roundTo && result.roundTo > 0 ? result.roundTo : 0.125;
                    self.qty = roundUpToMultiple(self.qty * result.qtyFactor, step);
                }
                return self.update();
            },
        },
        nx().deleteAction(self, () => deleteMessageFor(self), { roles: 'invoicing|project_manager', on: () => !self.delete_blockers.length }),
    ];
}

function deleteMessageFor(self: InvoiceItem): string {
    const lines = [$localize`:@@i18n.invoices.reallyDeleteThisInvoiceItem:really delete this invoice item?`];
    const tracked = self.foci_sum_duration ?? 0;
    const billed = self.billed_foci_sum_duration ?? 0;
    const milestones = self.milestones?.length ?? 0;

    if (tracked > 0) lines.push(`${tracked} h ` + $localize`:@@i18n.invoices.deleteItemTrackedHint:tracked time loses its assignment.`);
    if (billed > 0) lines.push(`${billed} h ` + $localize`:@@i18n.invoices.deleteItemBilledHint:prepared for billing count as unbilled again.`);
    if (milestones > 0) lines.push(`${milestones}x ` + $localize`:@@i18n.invoices.deleteItemMilestoneHint:milestone loses this item.`);

    return lines.join(' ');
}

function roundUpToMultiple(value: number, step: number): number {
    return Math.round((Math.ceil(value / step) * step) * 1e6) / 1e6;
}

function stripHtml(html: string): string {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? '';
}

function canCombineSelectedItems(): boolean {
    const selected = nx().nxService.selected;
    if (selected.length < 2) return false;

    const items = selected.map((_) => _.nx() as InvoiceItem);

    if (!items.every((item) => item.isRegularItem())) return false;

    const firstItem = items[0];
    return items.every((item) => item.price === firstItem.price && item.unit_name === firstItem.unit_name);
}

function combineSelectedItems(self: InvoiceItem, success?: (v?: any) => void): void {
    const selected = nx().nxService.selected;
    const items = selected.map((_) => _.nx() as InvoiceItem);

    if (items[0] !== self) return;

    nx().openModal<CombineInvoiceItemsResult>(MODAL.combineInvoiceItems, items)
        .then((result) => {
            if (!result) return;

            const itemIds = items.map((item) => item.id);
            const service = nx().getService(InvoiceItemService);

            service.combine(itemIds, result.description).subscribe(() => {
                success?.();
            });
        });
}
