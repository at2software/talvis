import type { NxAction } from '@models/_core/nx.actions';
import { Serializable } from '@models/_core/serializable';
import { getMilestoneActions } from './milestone.actions';
import { InvoiceItem } from '../invoice/invoice-item.model';
import { MilestoneState, getMilestoneStateInfo } from './milestone-state.enum';
import { User } from '../user/user.model';
import { Task } from '../task/task.model';
import { nx, TBroadcast } from '@models/_core/nx-bridge';
import { Project } from '../project/project.model';
import { dayjs, Dayjs } from '@constants/date/dates';
import { Type } from '@models/_core/hydrate';
import { Model } from '@constants/model/type-discriminators';
import { computed } from '@angular/core';
import { IHasExtIssue, effectiveExtIssueOf } from '../ext-issue/ext-issue.interface';
import type { Dictionary } from '@constants/constants';
import { Observable, tap } from 'rxjs';

@Model('Milestone')
export class Milestone extends Serializable implements IHasExtIssue {
    static API_PATH = (): string => 'milestones';

    protected override buildActions(): NxAction[] { return getMilestoneActions(this) }
    override update(changes?: Dictionary, silent = false): Observable<this> {
        return super.update(changes, silent).pipe(tap(() => nx().broadcast({ type: TBroadcast.Update, data: this })));
    }

    due_at: string | null = null;
    started_at: string | null = null;
    duration: number = 1;
    progress: number = 0;
    name: string = '';
    state: MilestoneState = MilestoneState.TODO;
    user_id: string | null = null;
    project_id: string | null = null;
    workload_hours: number | null = null;
    computed_workload_percent: number | null = null;
    comments: string = '';

    ext_issue_plugin_link_id?: string;
    ext_issue_id?: string;
    effectiveExtIssue = () => effectiveExtIssueOf(this);
    isExternalIssue = (): boolean => !!this.ext_issue_id;

    @Type(()=>User) user?: User;
    @Type(()=>Project) project?: Project;
    @Type(()=>Milestone) children: Milestone[] = [];
    @Type(()=>Milestone) dependants: Milestone[] = [];
    @Type(()=>Milestone) dependees: Milestone[] = [];
    @Type(()=>Task) tasks: Task[] = [];
    @Type(()=>InvoiceItem) invoice_items: InvoiceItem[] = [];

    setState = (state: MilestoneState) => this.update({ state: state });
    assignTo = (userId: string | null) => this.update({ user_id: userId });

    getAssignmentActions() {
        const currentRoot = nx().context?.assert(Milestone);
        if (!currentRoot?.project?.assignedUsers().length) {
            return [];
        }
        const project = currentRoot?.project;

        const assignedUsers = project.assignedUsers();
        const projectUsers = assignedUsers.map((assignee) => assignee.assignee as User);
        const actions = [];

        if (this.user_id !== null) {
            actions.push({
                title: $localize`:@@i18n.milestone.unassign:unassign`,
                group: true,
                action: () => this.assignTo(null),
            });
        }

        projectUsers.forEach((user: User) => {
            actions.push({
                title: user.getName(),
                group: true,
                action: () => this.assignTo(user.id),
            });
        });
        return actions;
    }

    get scss() {
        return getMilestoneStateInfo(this.state).bgClass;
    }

    isCurrentUserAssigned = (): boolean => this.user_id === nx().global.user?.id;
    time_started = (): Dayjs => dayjs(this.started_at);
    time_due = (): Dayjs => dayjs(this.due_at);
    plannedRange = (): { start: Dayjs; due: Dayjs } | null => {
        if (!this.due_at) return null;
        const due = dayjs(this.due_at).startOf('day');
        return { start: this.started_at ? dayjs(this.started_at).startOf('day') : due.subtract(this.duration ?? 1, 'day'), due };
    };

    startDate = computed(() => { const s = this.snapshot().started_at; return s ? new Date(s) : null; });
    endDate = computed((): Date | null => {
        const due = this.snapshot().due_at;
        if (!due) return null;
        const d = new Date(due);
        d.setHours(23, 59, 59, 999);
        return d;
    });
    isDuePast = (): boolean => (this.due_at ? dayjs().isAfter(this.due_at) : false);
    getStateInfo() {
        return getMilestoneStateInfo(this.state);
    }
}
