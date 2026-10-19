import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GlobalService } from '@models/global.service';
import { MilestoneService } from '@models/milestone/milestone.service';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';
import { Milestone } from '@models/milestone/milestone.model';
import { Project } from '@models/project/project.model';
import { InputModalService } from '@app/_modals/modal-input/modal-input.service';
import { UserService } from '@models/user/user.service';
import { ProjectService } from '@models/project/project.service';
import { Toast } from '@shards/toast/toast';
import { SpinnerComponent } from '@shards/spinner/spinner.component';
import { dayjs } from '@constants/date/dates';
import { modelListResource, modelResource } from '@models/http/model-resource';
import { mapWorkloadDto, withCalendarLoad } from '@app/hr/workload-dto.mapper';
import { ModalBaseService } from '@app/_modals/modal-base-service';
import { ModalEditMilestoneComponent } from '@app/_modals/modal-edit-milestone/modal-edit-milestone.component';
import { CdkDropListGroup } from '@angular/cdk/drag-drop';
import { NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Color } from '@constants/Color';
import { Dictionary } from '@constants/constants';
import { storageGet, storageSet } from '@constants/storage';
import { CustomGanttComponent, GanttRow } from '@app/projects/_shards/custom-gantt/custom-gantt.component';
import { CapacityCalendarComponent, CapacityCalendarDrop, MilestoneReschedule, PlannerEvent } from './capacity-calendar/capacity-calendar.component';
import { PlannerBacklogComponent, BacklogDragItem } from './planner-backlog/planner-backlog.component';
import { ExtIssueBacklogItem, ExtIssueBacklogService } from './external-issues/ext-issue-backlog.service';
import { ModalConvertIssueComponent } from './external-issues/modal-convert-issue/modal-convert-issue.component';
import { AddMilestoneResult, InboxDecision, ModalAddMilestoneComponent } from './capacity-calendar/modal-add-milestone/modal-add-milestone.component';
import { TaskService } from '@models/task/task.service';
import { Task } from '@models/task/task.model';
import { NxStatic, TBroadcast } from '@app/nx/nx.static';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, filter, firstValueFrom, interval, map, merge, Observable, of, scan } from 'rxjs';
import { PluginInstanceFactory } from '@models/http/plugins/plugin.instance.factory';
import { HttpErrorResponse } from '@angular/common/http';
import { CalendarPlugin } from '@models/http/plugins/plugin.calendar';
import { CALENDAR_CONNECTOR, ConnectorService } from '@app/profile/profile-plugins/connector.service';
import { CalendarEventDto } from '@models/_core/api-response';

const HORIZON_MONTHS = 3;
const VIEW_STORAGE_KEY = 'profileMilestonesView';
const CALENDARS_PARAM = 'PLANNER_CALENDARS';
const CALENDAR_REFRESH_MINUTES = 15;
const CALENDAR_FAILED = $localize`:@@i18n.planner.calendarFailed:could not be loaded`;

interface CalendarSetting {
    visible: boolean;
    busy: boolean;
    color: string;
}

const TEAM_CALENDARS = ['team', 'absences', 'birthdays'];

const DEFAULT_CALENDARS: Dictionary<{ label: string; color: string; hidden?: boolean }> = {
    team: { label: $localize`:@@i18n.planner.calendarTeam:team calendar`, color: '#00C9A7' },
    absences: { label: $localize`:@@i18n.planner.calendarAbsences:absences`, color: '#FFA200' },
    birthdays: { label: $localize`:@@i18n.planner.calendarBirthdays:birthdays`, color: '#DC0094', hidden: true },
    exchange: { label: 'Outlook', color: '#0A8BC9' },
};

@Component({
    selector: 'profile-milestones',
    templateUrl: './profile-milestones.component.html',
    styleUrls: ['./profile-milestones.component.scss'],
    imports: [ToolbarComponent, SpinnerComponent, CapacityCalendarComponent, PlannerBacklogComponent, CdkDropListGroup, NgbTooltipModule, NgbDropdownModule, CustomGanttComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileMilestonesComponent {
    global = inject(GlobalService);
    #milestoneService = inject(MilestoneService);
    #userService = inject(UserService);
    #projectService = inject(ProjectService);
    #inputModalService = inject(InputModalService);
    #extIssueBacklogService = inject(ExtIssueBacklogService);
    #modalService = inject(ModalBaseService);
    #taskService = inject(TaskService);
    #pluginFactory = inject(PluginInstanceFactory);
    #connectorService = inject(ConnectorService);

    rangeStart = signal(dayjs().startOf('day'));
    rangeEnd = signal(dayjs().startOf('day').add(HORIZON_MONTHS, 'months'));
    readonly timelineLabel = $localize`:@@i18n.planner.viewTimeline:timeline view`;
    readonly calendarLabel = $localize`:@@i18n.planner.viewCalendar:calendar view`;
    showWeekend = signal(false);
    view = signal<'calendar' | 'gantt'>(storageGet<string>(VIEW_STORAGE_KEY, 'calendar') === 'gantt' ? 'gantt' : 'calendar');
    draggingMilestone = signal(false);
    calendarSettings = signal<Dictionary<CalendarSetting>>(this.#readCalendarSettings());

    readonly #userId = computed(() => this.global.user?.id || undefined);
    readonly #workloadParams = computed(() => {
        const userId = this.#userId();
        return userId ? { userId, start: this.rangeStart().format('YYYY-MM-DD'), end: this.rangeEnd().format('YYYY-MM-DD') } : undefined;
    });

    readonly #workload = modelResource(this.#workloadParams, (_) => this.#userService.showDailyWorkload(_.userId, _.start, _.end, false));
    readonly #calendarEvents = modelListResource(this.#workloadParams, (_) => this.#userService.indexCalendarEvents(_.userId, _.start, _.end));
    readonly #milestones = modelListResource(this.#userId, (userId) => this.#milestoneService.indexUserMilestones(userId, true));

    readonly #calendarRefresh = signal(0);
    readonly #externalCalendars = modelResource(
        () => {
            const params = this.#workloadParams();
            return params ? { ...params, refresh: this.#calendarRefresh() } : undefined;
        },
        ({ start, end }) => {
            const plugins = this.#pluginFactory.getRootPluginInstancesByConstructor(CalendarPlugin);
            if (!plugins.length) return of([]);
            const endExclusive = dayjs(end).add(1, 'day').format('YYYY-MM-DD');
            return merge(
                ...plugins.map((plugin) =>
                    plugin.occurrences(start, endExclusive).pipe(
                        map((data) => ({ source: plugin.getName(), data, error: undefined as string | undefined })),
                        catchError((e: HttpErrorResponse) => of({ source: plugin.getName(), data: { events: [] as CalendarEventDto[] }, error: (e.error?.message as string | undefined) ?? CALENDAR_FAILED })),
                    ),
                ),
            ).pipe(scan((loaded, calendar) => [...loaded, calendar], [] as { source: string; data: { events: CalendarEventDto[] }; error: string | undefined }[]));
        },
    );
    readonly #external = computed(() => this.#externalCalendars.value() ?? []);
    readonly #calendarErrors = computed(() => new Map(this.#external().filter((c) => c.error).map((c) => [c.source, c.error!])));

    readonly workloadData = computed(() => {
        const data = mapWorkloadDto(this.#workload.value());
        if (!data) return null;
        const events = [...data.events, ...(this.#calendarEvents.hasValue() ? this.#calendarEvents.value() : []), ...this.#external().flatMap((c) => c.data.events)];
        const busy = events.filter((e) => this.#countsAsBusy(e.source));
        return withCalendarLoad({ ...data, events }, busy);
    });
    readonly calendars = computed(() => {
        const sources = new Set([...TEAM_CALENDARS, ...this.#external().map((c) => c.source), ...(this.workloadData()?.events ?? []).map((e: CalendarEventDto) => e.source)]);
        return [...sources].map((source) => ({ source, label: DEFAULT_CALENDARS[source]?.label ?? source, personal: !TEAM_CALENDARS.includes(source), error: this.#calendarErrors().get(source), ...this.#calendarSetting(source) }));
    });
    readonly plannerEvents = computed<PlannerEvent[]>(() =>
        (this.workloadData()?.events ?? []).map((e) => ({ ...e, ...this.#calendarSetting(e.source) })).filter((e) => e.visible),
    );
    readonly projectGroups = computed(() => {
        const groups = this.#milestones.value();
        groups.forEach((g) => g.milestones.forEach((m) => (m.project ??= g.project)));
        return groups;
    });

    readonly #convertedIssueKeys = computed(
        () => new Set(this.#allMilestones().filter((m) => m.ext_issue_id && m.ext_issue_plugin_link_id).map((m) => `${m.ext_issue_plugin_link_id}:${m.ext_issue_id}`)),
    );
    readonly #externalIssues = modelListResource(this.#userId, () => this.#extIssueBacklogService.loadAssignedIssues());
    readonly externalIssues = computed(() => {
        const converted = this.#convertedIssueKeys();
        return this.#externalIssues.value().filter((item) => !converted.has(item.id));
    });
    readonly externalIssuesLoading = this.#externalIssues.isLoading;

    readonly #inbox = modelListResource(this.#userId, () => this.#taskService.indexInbox());
    readonly inbox = this.#inbox.value;

    readonly loading = computed(() => ['idle', 'loading'].includes(this.#workload.status()) || ['idle', 'loading'].includes(this.#milestones.status()));
    readonly error = computed(() => (this.#workload.error() || this.#milestones.error() ? 'Failed to load planner data' : null));

    readonly #allMilestones = computed(() => this.projectGroups().flatMap((g) => g.milestones));
    readonly undatedMilestones = computed(() => {
        const unconfiguredIds = new Set(this.workloadData()?.unconfigured_milestones.map((m) => m.id));
        return this.#allMilestones().filter((m) => !m.started_at && !m.due_at && !unconfiguredIds.has(m.id));
    });
    readonly scheduledMilestones = computed(() => this.#allMilestones().filter((m) => m.plannedRange()));
    readonly ganttRows = computed<GanttRow[]>(() =>
        this.projectGroups()
            .filter((g) => g.milestones.length)
            .flatMap((g) => [{ type: 'header' as const, data: g.project, project: g.project }, ...g.milestones.map((m) => ({ type: 'milestone' as const, data: m, project: g.project }))]),
    );

    constructor() {
        NxStatic.broadcast$
            .pipe(
                takeUntilDestroyed(),
                filter((e) => [TBroadcast.Update, TBroadcast.Delete].includes(e.type) && e.data instanceof Milestone),
                debounceTime(50),
            )
            .subscribe(() => this.#reload());
        interval(CALENDAR_REFRESH_MINUTES * 60_000)
            .pipe(takeUntilDestroyed())
            .subscribe(() => this.#calendarRefresh.update((n) => n + 1));
    }

    async addCalendar(): Promise<void> {
        if (await this.#connectorService.create('calendar', CALENDAR_CONNECTOR)) this.#calendarRefresh.update((n) => n + 1);
    }

    onRangeShift(months: number): void {
        this.rangeStart.update((d) => d.add(months, 'months'));
        this.rangeEnd.update((d) => d.add(months, 'months'));
    }

    toggleWeekend = () => this.showWeekend.update((v) => !v);

    toggleView(): void {
        const next = this.view() === 'calendar' ? 'gantt' : 'calendar';
        this.view.set(next);
        storageSet(VIEW_STORAGE_KEY, next);
    }

    updateCalendar(source: string, change: Partial<CalendarSetting>): void {
        this.calendarSettings.update((settings) => ({ ...settings, [source]: { ...this.#calendarSetting(source), ...change } }));
        this.global.user?.updateParam(CALENDARS_PARAM, { value: JSON.stringify(this.calendarSettings()) }).subscribe();
    }

    #calendarSetting(source: string): CalendarSetting {
        const defaults = { visible: !DEFAULT_CALENDARS[source]?.hidden, busy: !TEAM_CALENDARS.includes(source), color: DEFAULT_CALENDARS[source]?.color ?? Color.uniqueColorFromString(source) };
        return { ...defaults, ...this.calendarSettings()[source] };
    }

    #countsAsBusy(source: string): boolean {
        const setting = this.#calendarSetting(source);
        return !TEAM_CALENDARS.includes(source) && setting.visible && setting.busy;
    }

    #readCalendarSettings(): Dictionary<CalendarSetting> {
        try {
            return JSON.parse(this.global.user?.getParam(CALENDARS_PARAM) ?? '{}');
        } catch {
            return {};
        }
    }

    onRangeToday(): void {
        this.rangeStart.set(dayjs().startOf('day'));
        this.rangeEnd.set(dayjs().startOf('day').add(HORIZON_MONTHS, 'months'));
    }

    onAddMilestone(project: Project) {
        this.#inputModalService
            .open($localize`:@@i18n.common.addMilestone:add milestone`)
            .then((result) => {
                if (result?.text?.trim()) {
                    this.#projectService.createMilestone(project.id, { name: result.text.trim() }).subscribe({
                        next: () => {
                            Toast.success($localize`:@@i18n.milestone.created:milestone created`);
                            this.#reload();
                        },
                        error: () => Toast.error($localize`:@@i18n.milestone.createError:failed to create milestone`),
                    });
                }
            })
            .catch(() => void 0);
    }

    onEditMilestone(milestone: Milestone): void {
        const projects = this.projectGroups().map((g) => g.project);
        this.#modalService.open(ModalEditMilestoneComponent, milestone, milestone.project, projects);
    }

    onMilestoneRescheduled({ milestone, started_at, due_at }: MilestoneReschedule): void {
        milestone.update({ started_at, due_at }, true).subscribe({
            error: () => Toast.error($localize`:@@i18n.planner.scheduleError:failed to schedule milestone`),
        });
    }

    onMilestoneUnscheduled(milestone: Milestone): void {
        milestone.update({ started_at: null, due_at: null }, true).subscribe({
            error: () => Toast.error($localize`:@@i18n.planner.scheduleError:failed to schedule milestone`),
        });
    }

    onCalendarDrop(drop: CapacityCalendarDrop): void {
        const item = drop.item as BacklogDragItem;
        if (item?.kind === 'milestone') this.#scheduleMilestone(item.milestone, drop.date);
        if (item?.kind === 'issue') this.#convertIssue(item.issue, drop.date);
        if (item?.kind === 'inbox') this.#processInboxItems([item.task], drop.date);
    }

    onAddMilestoneForDay(date: string): void {
        const projects = this.projectGroups().map((g) => g.project);
        this.#modalService.open(ModalAddMilestoneComponent, projects, date).then((result) => {
            if (!result) return;
            this.#createMilestone(result).subscribe({
                next: () => {
                    Toast.success($localize`:@@i18n.milestone.created:milestone created`);
                    this.#reload();
                },
                error: () => Toast.error($localize`:@@i18n.milestone.createError:failed to create milestone`),
            });
        });
    }

    onCapture(name: string): void {
        this.#taskService.capture(name).subscribe({
            next: () => this.#inbox.reload(),
            error: () => Toast.error($localize`:@@i18n.planner.captureError:failed to capture to-do`),
        });
    }

    onProcessInbox(): void {
        this.#processInboxItems([...this.inbox()], dayjs().format('YYYY-MM-DD'));
    }

    async #processInboxItems(tasks: Task[], date: string): Promise<void> {
        const plannerProjects = this.projectGroups().map((g) => g.project);
        for (const [index, task] of tasks.entries()) {
            const step = { name: task.name, description: task.description, link: task.link, linked: task.linkedObject(), index: index + 1, total: tasks.length };
            const result = (await this.#modalService.open(ModalAddMilestoneComponent, task.planningProjects(plannerProjects), date, step)) as AddMilestoneResult | InboxDecision | undefined;
            if (!result) break;
            if (result === 'skip') continue;
            try {
                if (result !== 'discard') await firstValueFrom(this.#createMilestone(result));
                await firstValueFrom(this.#taskService.close(task));
            } catch {
                Toast.error($localize`:@@i18n.planner.inboxError:failed to process inbox item`);
                break;
            }
        }
        this.#inbox.reload();
        this.#reload();
    }

    #createMilestone = (result: AddMilestoneResult): Observable<Milestone> =>
        this.#projectService.createMilestone(result.project.id, {
            name: result.name,
            workload_hours: result.workload_hours,
            started_at: result.started_at,
            due_at: result.due_at,
        });

    #convertIssue(issue: ExtIssueBacklogItem, dropDate: string): void {
        this.#modalService.open(ModalConvertIssueComponent, issue, dropDate).then((result) => {
            if (!result) return;
            this.#projectService
                .createMilestone(result.project.id, {
                    name: result.name,
                    workload_hours: result.workload_hours,
                    started_at: result.started_at,
                    due_at: result.due_at,
                    ext_issue_plugin_link_id: result.pluginLinkId ?? null,
                    ext_issue_id: issue.issueId,
                })
                .subscribe({
                    next: () => {
                        Toast.success($localize`:@@i18n.planner.issueConverted:issue converted to milestone`);
                        this.#reload();
                    },
                    error: () => Toast.error($localize`:@@i18n.planner.convertError:failed to convert issue`),
                });
        });
    }

    #scheduleMilestone(milestone: Milestone, date: string): void {
        const fallbackHpd = (this.workloadData()?.hpw ?? 40) / 5;
        const hours = milestone.workload_hours ?? fallbackHpd;
        const workloadByDate = new Map((this.workloadData()?.daily_workload ?? []).map((d) => [d.date, d]));

        const startedAt = dayjs(date);
        let dueAt = startedAt;
        let remaining = hours;
        for (let cursor = startedAt; remaining > 0; cursor = cursor.add(1, 'day')) {
            const day = workloadByDate.get(cursor.format('YYYY-MM-DD'));
            if (day?.is_break) continue;
            remaining -= day?.available_hours || fallbackHpd || 1;
            dueAt = cursor;
        }

        milestone
            .update(
                {
                    started_at: startedAt.format('YYYY-MM-DD'),
                    due_at: dueAt.format('YYYY-MM-DD'),
                    workload_hours: milestone.workload_hours ?? hours,
                },
                true,
            )
            .subscribe({
                error: () => Toast.error($localize`:@@i18n.planner.scheduleError:failed to schedule milestone`),
            });
    }

    #reload(): void {
        this.#workload.reload();
        this.#milestones.reload();
    }
}
