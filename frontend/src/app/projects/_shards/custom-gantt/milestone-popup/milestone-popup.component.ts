import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { DaterangepickerDirective, NgxDaterangepickerMd } from 'ngx-daterangepicker-material';
import { Milestone } from '@models/milestone/milestone.model';
import { Project } from '@models/project/project.model';
import { User } from '@models/user/user.model';
import { Task } from '@models/task/task.model';
import { MilestoneState, MILESTONE_STATES } from '@models/milestone/milestone-state.enum';
import { ProjectService } from '@models/project/project.service';
import { Toast } from '@shards/toast/toast';
import { dayjs, Dayjs } from '@constants/date/dates';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { Nx } from '@app/nx/nx.directive';
import { TaskService } from '@models/task/task.service';
import { tracked } from '@constants/tracked';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';

type TimePeriod = NonNullable<DaterangepickerDirective['value']>;
type DateRanges = DaterangepickerDirective['ranges'];

@Component({
    selector: 'milestone-popup',
    templateUrl: './milestone-popup.component.html',
    styleUrls: ['./milestone-popup.component.scss'],
    imports: [DecimalPipe, ReactiveFormsModule, FormsModule, NgxDaterangepickerMd, NgbTooltipModule, Nx],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MilestonePopupComponent {
    readonly milestone = input.required<Milestone>();
    readonly trackedMilestone = tracked(this.milestone);
    readonly project = input<Project | undefined>(undefined);
    readonly trackedProject = tracked(this.project);
    readonly projects = input<Project[]>([]);

    closed = output<void>();
    updated = output<Milestone>();
    deleted = output<Milestone>();

    milestoneStates = MILESTONE_STATES;
    readonly states = [MilestoneState.TODO, MilestoneState.IN_PROGRESS, MilestoneState.DONE];

    projectUsers = signal<User[]>([]);
    dateRangeModel = signal<TimePeriod | null>(null);
    selectedProjectId = signal<string | null>(null);
    milestoneForm!: FormGroup;

    readonly selectableProjects = computed<Project[]>(() => {
        const list = this.projects();
        if (list.length) return list;
        const project = this.project();
        return project ? [project] : [];
    });

    readonly selectedProject = computed<Project | undefined>(() => this.selectableProjects().find((p) => String(p.id) === this.selectedProjectId()));

    readonly assigneeOptions = computed<User[]>(() => {
        const users = this.projectUsers();
        const current = this.trackedMilestone()?.user;
        return current && !users.some((u) => u.id === current.id) ? [...users, current] : users;
    });

    readonly dateRanges: DateRanges = {
        Today: [dayjs(), dayjs()],
        Tomorrow: [dayjs().add(1, 'day'), dayjs().add(1, 'day')],
        'This Week': [dayjs(), dayjs().add(6, 'day')],
        'Next Week': [dayjs().add(7, 'day'), dayjs().add(13, 'day')],
    };

    readonly hasInvoiceItems = computed(() => !!this.trackedMilestone()?.invoice_items?.length);

    readonly totalInvoiceItemDuration = computed(() => {
        const items = this.trackedMilestone()?.invoice_items;
        if (!Array.isArray(items)) return 0;
        return items.reduce((total, item) => total + (item.qty || 0), 0);
    });

    #formBuilder = inject(FormBuilder);
    #projectService = inject(ProjectService);
    #inputModalService = inject(InputModalService);
    #taskService = inject(TaskService);
    #confirm = inject(ConfirmationService);

    constructor() {
        effect(() => {
            const project = this.selectedProject();
            this.projectUsers.set(project ? project.assignedUsers().map((a) => a.assignee as User) : []);
        });

        effect(() => {
            const milestone = this.trackedMilestone();
            if (milestone) this.#initializeForm(milestone);
        });
    }

    #initializeForm(milestone: Milestone) {
        milestone.tasks.forEach((task) => (task.httpService = this.#taskService));

        this.dateRangeModel.set(milestone.started_at && milestone.due_at ? { startDate: dayjs(milestone.time_started().toDate()), endDate: dayjs(milestone.time_due().toDate()) } : null);
        const projectId = milestone.project_id ?? this.project()?.id ?? null;
        this.selectedProjectId.set(projectId !== null ? String(projectId) : null);

        const value = {
            name: milestone.name || '',
            comments: milestone.comments || '',
            progress: milestone.progress || 0,
            state: milestone.state || MilestoneState.TODO,
            user_id: milestone.user_id,
            workload_hours: milestone.workload_hours,
        };

        if (this.milestoneForm) {
            this.milestoneForm.patchValue(value);
        } else {
            this.milestoneForm = this.#formBuilder.group({
                name: [value.name, [Validators.required, Validators.minLength(1)]],
                comments: [value.comments],
                progress: [value.progress, [Validators.min(0), Validators.max(1)]],
                state: [value.state],
                user_id: [value.user_id],
                workload_hours: [value.workload_hours, [Validators.min(0)]],
            });
        }
    }

    /** Mirrors Milestone::getComputedWorkloadPercentAttribute() so the modal can preview the effect of an in-progress edit before saving. */
    dailyWorkloadPercent(): number | null {
        const hours = this.milestoneForm?.get('workload_hours')?.value || this.totalInvoiceItemDuration();
        const range = this.dateRangeModel();
        if (!hours || hours <= 0 || !range) return null;

        const workingDays = this.#countWorkingDays(range.startDate, range.endDate);
        const dailyHours = hours / workingDays;
        const avgDailyHours = this.getSelectedUser()?.getAverageHpd() || 8;
        return Math.round((dailyHours / avgDailyHours) * 1000) / 10;
    }

    #countWorkingDays(start: Dayjs, end: Dayjs): number {
        let count = 0;
        for (let cursor = start.startOf('day'); !cursor.isAfter(end, 'day'); cursor = cursor.add(1, 'day')) {
            if (cursor.isoWeekday() <= 5) count++;
        }
        return Math.max(count, 1);
    }

    getSelectedUser(): User | null {
        const userId = this.milestoneForm?.get('user_id')?.value;
        if (!userId) return null;
        const milestoneUser = this.trackedMilestone()?.user;
        return this.projectUsers().find((u) => u.id === userId) ?? (milestoneUser && milestoneUser.id === userId ? milestoneUser : null);
    }

    onDateRangeChange = (event: TimePeriod) => {
        if (event.startDate && event.endDate) this.dateRangeModel.set({ startDate: event.startDate, endDate: event.endDate });
    };

    selectState = (state: MilestoneState) => this.milestoneForm.patchValue({ state });

    onSave() {
        if (!this.milestoneForm.valid) return;

        const { name, progress, state, user_id, comments, workload_hours } = this.milestoneForm.value;
        const milestone = this.trackedMilestone();
        const dateRange = this.dateRangeModel();

        const updateData: Dictionary<unknown> = { name, progress, state, user_id, comments };
        if (dateRange) {
            updateData['started_at'] = dateRange.startDate.format('YYYY-MM-DD');
            updateData['due_at'] = dateRange.endDate.format('YYYY-MM-DD');
        }
        updateData['workload_hours'] = workload_hours;
        const newProject = this.selectedProject();
        if (newProject && String(newProject.id) !== String(milestone.project_id)) updateData['project_id'] = newProject.id;

        milestone.update(updateData, true).subscribe({
            next: () => {
                Toast.success($localize`:@@i18n.milestone.updated:Milestone updated successfully`);
                Object.assign(milestone, updateData);
                if (newProject && updateData['project_id']) milestone.project = newProject;
                this.updated.emit(milestone);
                this.closed.emit();
            },
            error: (error: unknown) => {
                Toast.error($localize`:@@i18n.milestone.updateError:Failed to update milestone`);
                console.error('Error updating milestone:', error);
            },
        });
    }

    onCancel = () => this.closed.emit();

    async onDeleteMilestone() {
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.delete:delete`, message: $localize`:@@i18n.milestone.deleteConfirm:Are you sure you want to delete this milestone?` }))) return;
        const milestone = this.trackedMilestone();
        milestone.delete().subscribe({
            next: () => {
                Toast.success($localize`:@@i18n.milestone.deleted:Milestone deleted successfully`);
                this.deleted.emit(milestone);
                this.closed.emit();
            },
            error: (error: unknown) => {
                Toast.error($localize`:@@i18n.milestone.deleteFailed:Failed to delete milestone`);
                console.error('Error deleting milestone:', error);
            },
        });
    }

    onAddTask() {
        this.#inputModalService
            .open($localize`:@@i18n.task.addTask:Add Task`)
            .then((result) => {
                const milestone = this.trackedMilestone();
                if (!result?.text?.trim() || !milestone?.id || !this.trackedProject()?.id) return;
                this.#projectService
                    .createTaskForProject(this.trackedProject()!.id, {
                        name: result.text.trim(),
                        parent_type: 'App\\Models\\Milestone',
                        parent_id: milestone.id,
                    })
                    .subscribe({
                        next: (newTask) => {
                            Toast.success($localize`:@@i18n.task.created:Task created`);
                            milestone.tasks ??= [];
                            milestone.tasks.push(newTask);
                        },
                        error: (error: unknown) => {
                            Toast.error($localize`:@@i18n.task.createError:Failed to create task`);
                            console.error('Error creating task:', error);
                        },
                    });
            })
            .catch(() => void 0);
    }

    async onDeleteTask(task: Task) {
        if (!(await this.#confirm.ask({ title: $localize`:@@i18n.common.delete:delete`, message: $localize`:@@i18n.task.deleteConfirm:Are you sure you want to delete this task?` }))) return;
        task.delete().subscribe({
            next: () => {
                Toast.success($localize`:@@i18n.task.deleted:Task deleted successfully`);
                const milestone = this.trackedMilestone();
                if (milestone.tasks) milestone.tasks = milestone.tasks.filter((t) => t.id !== task.id);
            },
            error: (error: unknown) => {
                Toast.error($localize`:@@i18n.task.deleteFailed:Failed to delete task`);
                console.error('Error deleting task:', error);
            },
        });
    }
}
