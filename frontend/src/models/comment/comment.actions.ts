import { NxAction } from '@models/_core/nx.actions';
import { Comment } from './comment.model';
import { nx } from '@models/_core/nx-bridge';

export function getCommentActions(self: Comment): NxAction[] {
    const canEdit = () => self.isMyUser() || nx().global.user?.hasRole('admin') || false;
    return [
        {
            title: $localize`:@@i18n.comment.setType:set type`,
            doubleClick: true,
            on: canEdit,
            children: [
                { title: $localize`:@@i18n.comment.default:default`, action: () => self.update({ type: 0 }) },
                { title: $localize`:@@i18n.common.info:info`, action: () => self.update({ type: 1 }) },
                { title: $localize`:@@i18n.comment.warning:warning`, action: () => self.update({ type: 2 }) },
                { title: $localize`:@@i18n.comment.notice:notice`, action: () => self.update({ type: 3 }) },
            ],
        },
        { title: $localize`:@@i18n.comment.makeSticky:make sticky`, action: () => self.update({ is_sticky: true }), on: () => canEdit() && !self.is_sticky },
        { title: $localize`:@@i18n.comment.unstick:unstick`, action: () => self.update({ is_sticky: false }), on: () => canEdit() && self.is_sticky },
        nx().deleteAction(self, 'Really delete this comment?', { on: canEdit }),
    ];
}
