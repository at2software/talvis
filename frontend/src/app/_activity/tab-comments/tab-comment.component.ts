import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Nx } from '@app/nx/nx.directive';
import { NComponent } from '@shards/n/n.component';
import { Comment } from '@models/comment/comment.model';
import { SafePipe } from '@pipes/safe.pipe';
import { tracked } from '@constants/tracked';
import { AvatarComponent } from '@shards/avatar/avatar.component';

@Component({
    selector: 'tab-comment',
    templateUrl: './tab-comment.component.html',
    styleUrls: ['./tab-comment.component.scss'],
    imports: [AvatarComponent, DatePipe, Nx, NComponent, SafePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TabCommentComponent {
    
    readonly comment = input.required<Comment>();
    readonly trackedComment = tracked(this.comment);
    nicon = input<string | undefined>();

    formatFileSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1048576).toFixed(1)} MB`;
    }

    getFormattedTextWithLink = computed<string>(() => {
        const comment = this.trackedComment();
        let text = comment.formattedText();

        if (comment.var?.showGitIcon) {
            const branch = comment.var.branch || 'branch';
            const commitCount = comment.var.commitCount || 1;
            const userPart = comment.var.nicon ? comment.text.split(' ')[0] + ' ' : '';
            return `${userPart}<i>arrow_right</i> git <code>${branch}</code> [${commitCount}]`;
        }

        if (comment.var?.webUrl && comment.var?.issueNumber) {
            const issueNumber = comment.var.issueNumber;
            const webUrl = comment.var.webUrl;
            const isClosed = comment.var.isClosed;
            const state = comment.var.state;

            const stateColor = isClosed ? 'text-success' : 'text-warning';

            const linkedIssue = `<a href="${webUrl}" target="_blank">${issueNumber}</a>`;
            text = text.replace(issueNumber, linkedIssue);

            if (state) {
                text = text.replace(`: ${state}`, `: <span class="${stateColor}">${state}</span>`);
            }
        }
        return text;
    });
}
