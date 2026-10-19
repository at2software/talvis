import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { NgbCollapseModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { NComponent } from '@shards/n/n.component';
import { Milestone } from '@models/milestone/milestone.model';
import { Project } from '@models/project/project.model';
import { MilestonesGroup } from '@models/milestone/milestone-group.model';
import { ExtIssueBacklogItem } from '../external-issues/ext-issue-backlog.service';
import { Nx } from '@app/nx/nx.directive';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { Task } from '@models/task/task.model';

export type BacklogDragItem = { kind: 'milestone'; milestone: Milestone } | { kind: 'issue'; issue: ExtIssueBacklogItem } | { kind: 'inbox'; task: Task };

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'planner-backlog',
    templateUrl: './planner-backlog.component.html',
    styleUrls: ['./planner-backlog.component.scss'],
    imports: [CdkDrag, CdkDropList, NgbCollapseModule, NgbTooltipModule, AvatarComponent, NComponent, Nx, SpinnerComponent],
})
export class PlannerBacklogComponent {
    unconfiguredMilestones = input<Milestone[]>([]);
    undatedMilestones = input<Milestone[]>([]);
    projectGroups = input<MilestonesGroup[]>([]);

    externalIssues = input<ExtIssueBacklogItem[]>([]);
    externalIssuesLoading = input<boolean>(false);
    inbox = input<Task[]>([]);
    unscheduleTarget = input(false);

    addMilestone = output<Project>();
    capture = output<string>();
    processInbox = output<void>();

    readonly projects = computed(() => this.projectGroups().map((g) => g.project));

    milestoneItem = (milestone: Milestone): BacklogDragItem => ({ kind: 'milestone', milestone });
    issueItem = (issue: ExtIssueBacklogItem): BacklogDragItem => ({ kind: 'issue', issue });
    inboxItem = (task: Task): BacklogDragItem => ({ kind: 'inbox', task });

    onCapture(field: HTMLInputElement): void {
        const name = field.value.trim();
        if (!name) return;
        this.capture.emit(name);
        field.value = '';
    }

    openIssue(issue: ExtIssueBacklogItem, event: Event): void {
        event.stopPropagation();
        issue.task.httpService.open(issue.task);
    }

    trackById = (_index: number, _: { id: string }): string => _.id;
}
