import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModalBaseComponent } from '@app/_modals/modal-base.component';
import { IssuePickerComponent } from '@shards/issue-picker/issue-picker.component';
import { Task } from '@models/task/task.model';
import { ExtIssueLinkResult } from '@models/_core/modal-results';

export interface ExtIssueLinkable {
    ext_issue_plugin_link_id?: string;
    ext_issue_id?: string;
    parent_id?: string;
    parent_type?: string;
    project_id?: string;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'modal-link-ext-issue',
    templateUrl: './modal-link-ext-issue.component.html',
    imports: [FormsModule, IssuePickerComponent],
})
export class ModalLinkExtIssueComponent extends ModalBaseComponent<ExtIssueLinkResult> {
    target!: ExtIssueLinkable;
    projectId = signal<string | undefined>(undefined);

    selectedLinkId = signal<string>('');
    selectedIssueId = signal<string>('');
    manualId = signal<string>('');

    readonly picker = viewChild(IssuePickerComponent);

    readonly hadLink = computed(() => !!this.target?.ext_issue_id);
    readonly activeTracker = computed(() => this.picker()?.activeTracker());
    readonly effectiveIssueId = computed(() => this.manualId().trim() || this.selectedIssueId().trim());
    readonly canSubmit = computed(() => {
        const manual = this.manualId().trim();
        if (manual) return !!this.activeTracker();
        return !!this.selectedIssueId().trim() && !!this.selectedLinkId();
    });

    init(target: ExtIssueLinkable): void {
        this.target = target;
        this.selectedLinkId.set(target.ext_issue_plugin_link_id ? String(target.ext_issue_plugin_link_id) : '');
        this.selectedIssueId.set(target.ext_issue_id ?? '');
        const projectId = target.project_id ?? (target.parent_type?.endsWith('Project') ? target.parent_id : undefined);
        this.projectId.set(projectId);
    }

    canConnect = (): boolean => {
        const tracker = this.activeTracker();
        return !tracker || tracker.instance.canConnect();
    };

    onIssueSelected(task: Task): void {
        this.manualId.set(task.id);
    }

    unlink(): void {
        this.selectedLinkId.set('');
        this.selectedIssueId.set('');
        this.manualId.set('');
        this.accept();
    }

    onSuccess(): ExtIssueLinkResult {
        const manual = this.manualId().trim();
        if (manual) {
            const tracker = this.activeTracker();
            return tracker ? { ext_issue_plugin_link_id: String(tracker.link.id), ext_issue_id: manual } : { ext_issue_plugin_link_id: null, ext_issue_id: null };
        }
        const issueId = this.selectedIssueId().trim();
        if (!this.selectedLinkId() || !issueId) return { ext_issue_plugin_link_id: null, ext_issue_id: null };
        return { ext_issue_plugin_link_id: this.selectedLinkId(), ext_issue_id: issueId };
    }
}
