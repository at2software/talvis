import { MODAL, registerModal } from '@models/_core/modal-registry';
import { ModalInputComponent } from '@app/_modals/modal-input/modal-input.component';
import { ModalConfirmComponent } from '@app/_modals/modal-confirm/modal-confirm.component';
import { ModalEditFocusComponent } from '@app/_modals/modal-edit-focus/modal-edit-focus.component';
import { ModalEditExpenseComponent } from '@app/_modals/modal-edit-expense/modal-edit-expense.component';
import { ModalEditCashComponent } from '@app/_modals/modal-edit-cash/modal-edit-cash.component';
import { ModalEditMilestoneComponent } from '@app/_modals/modal-edit-milestone/modal-edit-milestone.component';
import { ModalEditInvoiceItemComponent } from '@app/_modals/modal-edit-invoice-item/modal-edit-invoice-item.component';
import { ModalFilePreviewComponent } from '@app/_modals/modal-file-preview/modal-file-preview.component';
import { ModalLinkExtIssueComponent } from '@app/_modals/modal-link-ext-issue/modal-link-ext-issue.component';
import { ModalAssignProductComponent } from '@app/_modals/modal-assign-product/modal-assign-product.component';
import { ModalCombineInvoiceItemsComponent } from '@app/_modals/modal-combine-invoice-items/modal-combine-invoice-items.component';
import { ModalCombineDebriefItemsComponent } from '@app/_modals/modal-combine-debrief-items/modal-combine-debrief-items.component';
import { ModalReviewVacationComponent } from '@app/_modals/modal-review-vacation/modal-review-vacation.component';
import { ModalEditWebhookEndpointComponent } from '@app/_modals/modal-edit-webhook-endpoint/modal-edit-webhook-endpoint.component';
import { ModalWebhookDeliveriesComponent } from '@app/_modals/modal-webhook-deliveries/modal-webhook-deliveries.component';

export function registerModals(): void {
    registerModal(MODAL.input, ModalInputComponent);
    registerModal(MODAL.confirm, ModalConfirmComponent);
    registerModal(MODAL.editFocus, ModalEditFocusComponent);
    registerModal(MODAL.editExpense, ModalEditExpenseComponent);
    registerModal(MODAL.editCash, ModalEditCashComponent);
    registerModal(MODAL.editMilestone, ModalEditMilestoneComponent);
    registerModal(MODAL.editInvoiceItem, ModalEditInvoiceItemComponent);
    registerModal(MODAL.filePreview, ModalFilePreviewComponent);
    registerModal(MODAL.linkExtIssue, ModalLinkExtIssueComponent);
    registerModal(MODAL.assignProduct, ModalAssignProductComponent);
    registerModal(MODAL.combineInvoiceItems, ModalCombineInvoiceItemsComponent);
    registerModal(MODAL.combineDebriefItems, ModalCombineDebriefItemsComponent);
    registerModal(MODAL.reviewVacation, ModalReviewVacationComponent);
    registerModal(MODAL.editWebhookEndpoint, ModalEditWebhookEndpointComponent);
    registerModal(MODAL.webhookDeliveries, ModalWebhookDeliveriesComponent);
}

registerModals();
