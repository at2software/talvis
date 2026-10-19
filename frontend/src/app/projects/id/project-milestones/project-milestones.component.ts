import { ProjectService } from '@models/project/project.service';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { modelResource } from '@models/http/model-resource';
import { Project } from '@models/project/project.model';
import { Assignee } from '@models/assignee/assignee.model';
import { Milestone } from '@models/milestone/milestone.model';
import { ProjectDetailGuard } from '@app/projects/project-details.guard';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { NgbTooltipModule, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { ConfirmationService } from '@app/_modals/modal-confirm/confirmation.service';
import { Toast } from '@shards/toast/toast';
import { Task } from '@models/task/task.model';
import { CustomGanttComponent, GanttRow } from '@app/projects/_shards/custom-gantt/custom-gantt.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { EmptyStateComponent } from '@shards/empty-state/empty-state.component';
import { storageGet, storageSet } from '@constants/storage';
import { dayjs } from '@constants/date/dates';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { GlobalService } from '@models/global.service';
import { getMilestoneStateInfo } from '@models/milestone/milestone-state.enum';

interface T_ASSIGNMENT {
    assignee: Assignee;
    tasks: Task[];
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'project-milestones',
    templateUrl: './project-milestones.component.html',
    styleUrls: ['./project-milestones.component.scss'],
    host: { class: 'container-full' },
    imports: [ToolbarComponent, CustomGanttComponent, NgbTooltipModule, NgbDropdownModule, SpinnerComponent, EmptyStateComponent, DatePipe, DecimalPipe, Nx, AvatarComponent],
})
export class ProjectMilestonesComponent {
    ganttComponent = viewChild(CustomGanttComponent);

    project!: Project;
    assignees: T_ASSIGNMENT[] = [];
    currentViewMode: string = storageGet('projectMilestonesViewMode', 'Week');

    parent = inject(ProjectDetailGuard);

    #destroyRef = inject(DestroyRef);
    #projectService = inject(ProjectService);
    #inputModalService = inject(InputModalService);
    #confirmationService = inject(ConfirmationService);
    #global = inject(GlobalService);

    readonly #milestones = modelResource(
        () => this.parent.object()?.id || undefined,
        (projectId) => this.#projectService.indexMilestones(projectId),
    );
    readonly isLoading = this.#milestones.isLoading;

    readonly ganttRows = computed<GanttRow[]>(() => {
        const project = this.parent.object();
        const data = this.#milestones.value();
        if (!project || !data) return [];

        const milestones = data.milestones || [];
        milestones.forEach((milestone) => (milestone.project = project));

        const rows: GanttRow[] = [{ type: 'header', data: project, project }];
        (data.project_tasks || []).forEach((task: Task) => rows.push({ type: 'task', data: task, project }));
        milestones.forEach((milestone: Milestone) => {
            rows.push({ type: 'milestone', data: milestone, project });
            (milestone.tasks || []).forEach((task: Task) => rows.push({ type: 'task', data: task, project, milestone }));
        });
        return rows;
    });

    readonly milestoneList = computed<Milestone[]>(() => [...(this.#milestones.value()?.milestones ?? [])].sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? '')));

    readonly stateInfo = getMilestoneStateInfo;
    isOverdue = (m: Milestone) => m.state !== 2 && !!m.due_at && dayjs(m.due_at).isBefore(dayjs(), 'day');
    userFor = (m: Milestone) => this.#global.userFor(m.user_id ?? '');

    constructor() {
        effect(() => (this.project = this.parent.object()));
        effect(() => {
            const project = this.parent.object();
            const data = this.#milestones.value();
            if (!project || !data) return;
            project.milestones = data.milestones || [];
            project.tasks = data.project_tasks || [];
        });
    }

    loadMilestones = () => this.#milestones.reload();

    find = (id: string): T_ASSIGNMENT => this.assignees.find((x) => x.assignee.id == id) ?? this.assignees[0];

    onAddButton = () => {
        this.#inputModalService
            .open($localize`:@@i18n.common.addMilestone:add milestone`)
            .then((result) => {
                if (result?.text?.trim()) {
                    this.#projectService
                        .createMilestone(this.project.id, {
                            name: result.text.trim(),
                            ...this.#nextMilestoneSlot(),
                        })
                        .pipe(takeUntilDestroyed(this.#destroyRef))
                        .subscribe({
                            next: () => {
                                Toast.success($localize`:@@i18n.milestone.created:milestone created`);
                                this.loadMilestones();
                            },
                            error: (error: unknown) => {
                                Toast.error($localize`:@@i18n.milestone.createError:failed to create milestone`);
                                console.error('Error creating milestone:', error);
                            },
                        });
                }
            })
            .catch(() => {
                // User cancelled - no action needed
            });
    };

    onAddWholeProject = () => {
        this.#projectService
            .createMilestone(this.project.id, {
                name: this.project.name,
                workload_hours: this.project.wholeProjectHours(),
                ...this.#nextMilestoneSlot(),
            })
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe({
                next: () => {
                    Toast.success($localize`:@@i18n.milestone.created:milestone created`);
                    this.loadMilestones();
                },
                error: () => Toast.error($localize`:@@i18n.milestone.createError:failed to create milestone`),
            });
    };

    #nextMilestoneSlot() {
        const lastDue = (this.project.milestones ?? []).map((m) => m.due_at).filter((d): d is string => !!d).sort().at(-1);
        const today = dayjs().startOf('day');
        const start = lastDue && dayjs(lastDue).isAfter(today) ? dayjs(lastDue).add(1, 'day') : today;
        return { started_at: start.format('YYYY-MM-DD'), due_at: start.add(6, 'day').format('YYYY-MM-DD') };
    }

    onViewModeChange = (mode: string) => {
        this.currentViewMode = mode;
        storageSet('projectMilestonesViewMode', mode);
    };

    onConvertInvoiceItems = () => {
        if (!this.project?.id) {
            return;
        }

        if (!this.project?.invoice_items?.length) {
            return;
        }

        this.#projectService
            .convertInvoiceItemsToMilestones(this.project.id)
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe({
                next: (response) => {
                    if (response.milestones_created > 0) {
                        this.loadMilestones();
                    }
                },
                error: (error) => {
                    console.error('Error converting invoice items to milestones:', error);
                },
            });
    };

    onWipeBoard = () => {
        if (!this.project?.id) {
            return;
        }

        const milestoneCount = this.project.milestones?.length || 0;
        if (milestoneCount === 0) {
            return;
        }

        this.#confirmationService
            .confirm({
                title: $localize`:@@i18n.milestones.wipeBoardTitle:Wipe Board`,
                message: $localize`:@@i18n.milestones.wipeBoardMessage:Are you sure you want to delete all ${milestoneCount} milestones? This action cannot be undone.`,
                btnOkText: $localize`:@@i18n.common.delete:delete`,
                btnCancelText: $localize`:@@i18n.common.cancel:cancel`,
                dialogSize: 'sm',
            })
            .then(() => {
                this.#projectService
                    .wipeMilestones(this.project.id.toString())
                    .pipe(takeUntilDestroyed(this.#destroyRef))
                    .subscribe({
                        next: () => {
                            Toast.success($localize`:@@i18n.milestones.allMilestonesDeleted:All milestones deleted successfully`);
                            this.loadMilestones();
                        },
                        error: (error) => {
                            Toast.error($localize`:@@i18n.milestones.errorDeletingMilestones:Failed to delete milestones`);
                            console.error('Error deleting all milestones:', error);
                        },
                    });
            })
            .catch(() => {
                // User cancelled - no action needed
            });
    };

    onAddTask = (project: Project) => {
        this.#inputModalService
            .open($localize`:@@i18n.task.addTask:Add Task`)
            .then((result) => {
                if (result?.text?.trim()) {
                    this.#projectService
                        .createTaskForProject(project.id, {
                            name: result.text.trim(),
                            parent_type: 'App\\Models\\Project',
                            parent_id: project.id,
                        })
                        .pipe(takeUntilDestroyed(this.#destroyRef))
                        .subscribe({
                            next: () => {
                                Toast.success($localize`:@@i18n.task.created:Task created`);
                                this.loadMilestones();
                            },
                            error: (error: unknown) => {
                                Toast.error($localize`:@@i18n.task.createError:Failed to create task`);
                                console.error('Error creating task:', error);
                            },
                        });
                }
            })
            .catch(() => {
                // User cancelled
            });
    };
}
