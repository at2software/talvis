import { NxAction, NxActionType } from "@models/_core/nx.actions";
import { GitlabAuditProject } from "./gitlab-audit-project.model";

export const GitlabAuditProjectActions = (that:GitlabAuditProject):NxAction[] => [
        {
            title: 'run audit now',
            type: NxActionType.Creative,
            on: () => !!that.cron,
            action: (s) => that.var.onRun?.(that, s),
        },
        {
            title: 'rename',
            action: (s) => that.var.onRename?.(that, s),
        },
        {
            title: 'link with company',
            on: () => !that.company_id,
            action: (s) => that.var.onLinkCompany?.(that, s),
        },
        {
            title: 'unlink company',
            on: () => !!that.company_id,
            action: (s) => that.var.onUnlinkCompany?.(that, s),
        },
        {
            title: 'link with recurring invoice item',
            on: () => !!that.company_id && !that.invoice_item_id,
            action: (s) => that.var.onLinkInvoiceItem?.(that, s),
        },
        {
            title: 'unlink invoice item',
            on: () => !!that.invoice_item_id,
            action: (s) => that.var.onUnlinkInvoiceItem?.(that, s),
        },
        {
            title: 'create recurring invoice item',
            type: NxActionType.Creative,
            on: () => !!that.company_id && !that.invoice_item_id,
            action: (s) => that.var.onCreateInvoiceItem?.(that, s),
        },
        {
            title: 'delete',
            doubleClick: true,
            type: NxActionType.Destructive,
            action: (s) => that.var.onDelete?.(that, s),
        },
    ];
