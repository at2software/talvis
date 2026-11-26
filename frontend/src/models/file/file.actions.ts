import { NxAction } from '@models/_core/nx.actions';
import { File } from './file.model';
import { nx } from '@models/_core/nx-bridge';
import { FileService } from './file.service';
import { MODAL } from '@models/_core/modal-registry';

export const isPreviewable = (file: File): boolean => file.mime === 'application/pdf' || !!file.mime?.startsWith('image/') || file.isMarkdown();

export function getFileActions(self: File): NxAction[] {
    return [
        { title: $localize`:@@i18n.common.preview:preview`, doubleClick: true, action: () => nx().openModal(MODAL.filePreview, self), on: () => isPreviewable(self) },
        { title: $localize`:@@i18n.common.download:download`, action: () => (nx().getService(FileService)! as FileService).download(self), group: true },
        nx().deleteAction(self, $localize`:@@i18n.invoices.reallyDeleteThisFile:really delete this file?`, { roles: 'admin' }),
    ];
}
