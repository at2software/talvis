import type { Type } from '@angular/core';
import type { INxModal } from './nx.modal.interface';

export const MODAL = {
    input: 'input',
    confirm: 'confirm',
    editFocus: 'edit-focus',
    editExpense: 'edit-expense',
    editCash: 'edit-cash',
    editMilestone: 'edit-milestone',
    editInvoiceItem: 'edit-invoice-item',
    filePreview: 'file-preview',
    linkExtIssue: 'link-ext-issue',
    assignProduct: 'assign-product',
    combineInvoiceItems: 'combine-invoice-items',
    combineDebriefItems: 'combine-debrief-items',
    reviewVacation: 'review-vacation',
    editWebhookEndpoint: 'edit-webhook-endpoint',
    webhookDeliveries: 'webhook-deliveries',
} as const;

export type ModalKey = (typeof MODAL)[keyof typeof MODAL];

export type ModalRef = string | Type<INxModal>;

const registry = new Map<string, Type<INxModal>>();

export const registerModal = (key: string, component: Type<INxModal>): void => void registry.set(key, component);

export const resolveModal = (ref: ModalRef): Type<INxModal> => {
    if (typeof ref !== 'string') return ref;
    const component = registry.get(ref);
    if (!component) throw new Error(`No modal registered for key "${ref}"`);
    return component;
};
