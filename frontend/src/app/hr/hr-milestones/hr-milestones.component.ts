import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { GlobalService } from '@models/global.service';
import { MilestoneService } from '@models/milestone/milestone.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Milestone } from '@models/milestone/milestone.model';
import { ProjectService } from '@models/project/project.service';
import { UserService } from '@models/user/user.service';
import { Toast } from '@shards/toast/toast';
import { HrTeamService } from '../hr-team/hr-team.service';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { dayjs } from '@constants/date/dates';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { mapWorkloadDto } from '../workload-dto.mapper';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalEditMilestoneComponent } from '@app/_modals/modal-edit-milestone/modal-edit-milestone.component';
import { CapacityCalendarComponent, MilestoneReschedule } from '@app/profile/profile-milestones/capacity-calendar/capacity-calendar.component';
import { ModalAddMilestoneComponent } from '@app/profile/profile-milestones/capacity-calendar/modal-add-milestone/modal-add-milestone.component';
import { CustomGanttComponent } from '@app/projects/_shards/custom-gantt/custom-gantt.component';
import { plannerView, toGanttRows } from '@app/profile/profile-milestones/planner-view';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';

const HORIZON_MONTHS = 3;

@Component({
    selector: 'hr-milestones',
    templateUrl: './hr-milestones.component.html',
    styleUrls: ['./hr-milestones.component.scss'],
    imports: [ToolbarComponent, SpinnerComponent, CapacityCalendarComponent, CustomGanttComponent, NgbTooltipModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrMilestonesComponent {
    global = inject(GlobalService);
    #hrTeamService = inject(HrTeamService);
    #milestoneService = inject(MilestoneService);
    #userService = inject(UserService);
    #projectService = inject(ProjectService);
    #modalService = inject(ModalBaseService);

    rangeStart = signal(dayjs().startOf('day'));
    rangeEnd = signal(dayjs().startOf('day').add(HORIZON_MONTHS, 'months'));
    readonly timelineLabel = $localize`:@@i18n.planner.viewTimeline:timeline view`;
    readonly calendarLabel = $localize`:@@i18n.planner.viewCalendar:calendar view`;
    readonly #view = plannerView();
    readonly view = this.#view.view;
    readonly toggleView = this.#view.toggle;
    readonly user = computed(() => this.#hrTeamService.user());

    readonly #userId = computed(() => this.#hrTeamService.userId());
    readonly #workloadParams = computed(() => {
        const userId = this.#userId();
        return userId ? { userId, start: this.rangeStart().format('YYYY-MM-DD'), end: this.rangeEnd().format('YYYY-MM-DD') } : undefined;
    });

    readonly #workload = modelResource(this.#workloadParams, (_) => this.#userService.showDailyWorkload(_.userId, _.start, _.end));
    readonly #milestones = modelListResource(this.#userId, (userId) => this.#milestoneService.indexUserMilestones(userId));

    readonly workloadData = computed(() => mapWorkloadDto(this.#workload.value()));
    readonly projectGroups = computed(() => {
        const groups = this.#milestones.value();
        groups.forEach((g) => g.milestones.forEach((m) => (m.project ??= g.project)));
        return groups;
    });

    readonly loading = computed(() => ['idle', 'loading'].includes(this.#workload.status()) || ['idle', 'loading'].includes(this.#milestones.status()));
    readonly error = computed(() => (this.#workload.error() || this.#milestones.error() ? 'Failed to load milestones' : null));

    readonly #allMilestones = computed(() => this.projectGroups().flatMap((g) => g.milestones));
    readonly scheduledMilestones = computed(() => this.#allMilestones().filter((m) => m.started_at && m.due_at));
    readonly ganttRows = computed(() => toGanttRows(this.projectGroups()));

    onRangeShift(months: number): void {
        this.rangeStart.update((d) => d.add(months, 'months'));
        this.rangeEnd.update((d) => d.add(months, 'months'));
    }

    onRangeToday(): void {
        this.rangeStart.set(dayjs().startOf('day'));
        this.rangeEnd.set(dayjs().startOf('day').add(HORIZON_MONTHS, 'months'));
    }

    onEditMilestone(milestone: Milestone): void {
        const projects = this.projectGroups().map((g) => g.project);
        this.#modalService.open(ModalEditMilestoneComponent, milestone, milestone.project, projects).then(() => this.#reload());
    }

    onMilestoneRescheduled({ milestone, started_at, due_at }: MilestoneReschedule): void {
        milestone.update({ started_at, due_at }, true).subscribe({
            next: () => this.#reload(),
            error: () => Toast.error($localize`:@@i18n.planner.scheduleError:failed to schedule milestone`),
        });
    }

    onAddMilestoneForDay(date: string): void {
        const projects = this.projectGroups().map((g) => g.project);
        this.#modalService.open(ModalAddMilestoneComponent, projects, date).then((result) => {
            if (!result) return;
            this.#projectService
                .createMilestone(result.project.id, {
                    name: result.name,
                    workload_hours: result.workload_hours,
                    started_at: result.started_at,
                    due_at: result.due_at,
                })
                .subscribe({
                    next: () => {
                        Toast.success($localize`:@@i18n.milestone.created:milestone created`);
                        this.#reload();
                    },
                    error: () => Toast.error($localize`:@@i18n.milestone.createError:failed to create milestone`),
                });
        });
    }

    #reload(): void {
        this.#workload.reload();
        this.#milestones.reload();
    }
}
