import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, AfterViewInit, Injector, afterNextRender, inject, input, output, computed, signal, effect, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { Router } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { NgbDropdown, NgbDropdownModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { Milestone } from '@models/milestone/milestone.model';
import { Project } from '@models/project/project.model';
import { Task } from '@models/task/task.model';
import { User } from '@models/user/user.model';
import { UserService } from '@models/user/user.service';
import { NxService } from '@app/nx/nx.service';
import { Nx } from '@app/nx/nx.directive';
import { MilestoneService } from '@models/milestone/milestone.service';
import { Toast } from '@shards/toast/toast';
import { environment } from '@environments/environment';
import { Color } from '@constants/Color';
import { storageGet, storageSet } from '@constants/storage';
import { dayjs } from '@constants/date/dates';
import { ToolbarComponent } from '@app/app/toolbar/toolbar.component';

export type GanttRow =
    | { type: 'header'; data: Project; project: Project; milestone?: Milestone }
    | { type: 'milestone'; data: Milestone; project?: Project; milestone?: Milestone }
    | { type: 'task'; data: Task; project?: Project; milestone?: Milestone };

interface TimelineUnit {
    date: Date;
    x: number;
    label: string;
    isWeekend?: boolean;
    weekNumber?: number;
    workloadPercent?: number;
}

interface DailyWorkload {
    date: string;
    total_percent: number;
    is_break: boolean;
}

interface TimelineGroup {
    label: string;
    x: number;
    width: number;
    workloadPercent?: number;
}

interface RenderedMilestone {
    milestone: Milestone;
    x: number;
    width: number;
    y: number;
    rowIndex: number;
}

interface Dependency {
    from: Milestone;
    to: Milestone;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'custom-gantt',
    templateUrl: './custom-gantt.component.html',
    styleUrls: ['./custom-gantt.component.scss'],
    imports: [DatePipe, DecimalPipe, NgbDropdownModule, Nx, NgbTooltipModule, ToolbarComponent],
    host: { class: 'custom-gantt-host' },
})
export class CustomGanttComponent implements AfterViewInit {
    rows = input<GanttRow[]>([]);
    viewMode = input<string>('Week');
    milestoneProjectMap = input<Map<string, Project>>();
    showProjectHeaders = input<boolean>(true);
    workloadUser = input<User>();

    addMilestone = output<Project>();
    addTask = output<Project>();

    svgWidth = signal(0);
    svgHeight = signal(0);
    scrollY = signal(0);
    viewportLeft = signal(0);
    viewportRight = signal(0);
    timelineUnits = signal<TimelineUnit[]>([]);
    timelineGroups = signal<TimelineGroup[]>([]);
    renderedMilestones = signal<RenderedMilestone[]>([]);
    dependencies = signal<Dependency[]>([]);
    hideCompleted = signal(storageGet('gantt.hideCompleted', false));
    drawingDependency = signal(false);
    dependencyFromMilestone = signal<Milestone | null>(null);
    dependencyToMilestone = signal<Milestone | null>(null);
    dependencyDrawingPath = signal('');
    areaSelecting = signal(false);
    areaSelectStart = signal({ x: 0, y: 0 });
    areaSelectEnd = signal({ x: 0, y: 0 });

    readonly Math = Math;
    readonly hideCompletedLabel = $localize`:@@i18n.milestones.hideCompleted:hide completed milestones`;
    readonly showCompletedLabel = $localize`:@@i18n.milestones.showCompleted:show completed milestones`;
    readonly HEADER_ROW_HEIGHT = 22;
    readonly MILESTONE_ROW_HEIGHT = 48;
    readonly TASK_HEIGHT = 20;
    readonly TIMELINE_HEADER_HEIGHT = 60;
    readonly GRID_COLOR = '#333';
    readonly UNIT_WIDTH = computed(() => ({ Day: 40, Week: 80, Month: 120, Year: 200 })[this.viewMode()] ?? 40);

    #timelineUnits: TimelineUnit[] = [];
    #timelineGroups: TimelineGroup[] = [];
    #renderedMilestones: RenderedMilestone[] = [];
    #deps: Dependency[] = [];
    #timelineStart = new Date();
    #timelineEnd = new Date();
    #xOffset = 0;

    #draggingMilestone: Milestone | null = null;
    #dragStartX = 0;
    #dragStartDate: Date | null = null;
    #dragOriginalDates = new Map<string, { start: Date; end: Date | null }>();
    #resizingMilestone: Milestone | null = null;
    #resizingSide: 'left' | 'right' | null = null;
    #resizeStartDate: Date | null = null;
    #resizeEndDate: Date | null = null;
    #hasMoved = false;
    #dependencyHasMoved = false;
    #completingTasks = signal<Set<string>>(new Set());
    #disappearingTasks = signal<Set<string>>(new Set());
    #workloadMap = new Map<string, DailyWorkload>();
    #cachedTodayX = 0;
    #initialized = false;

    protected readonly svgContainer = viewChild.required<ElementRef<SVGSVGElement>>('svgContainer');

    #elementRef = inject(ElementRef);
    #router = inject(Router);
    #nxService = inject(NxService);
    #milestoneService = inject(MilestoneService);
    #userService = inject(UserService);
    #destroyRef = inject(DestroyRef);
    #injector = inject(Injector);

    visibleRows = computed(() => {
        const filtered = this.rows().filter((row) => !(row.type === 'task' && row.data.state === 1));

        if (!this.hideCompleted()) return filtered;

        const projectsWithVisibleMilestones = new Set<string>();
        filtered.forEach((row) => {
            if (row.type === 'milestone' && (row.data as Milestone).state !== 2) {
                projectsWithVisibleMilestones.add(String((row.data as Milestone).project_id));
            }
        });

        return filtered.filter((row) => {
            if (row.type === 'milestone') return (row.data as Milestone).state !== 2;
            if (row.type === 'header') return row.project && projectsWithVisibleMilestones.has(String(row.project.id));
            if (row.type === 'task' && row.milestone) return row.milestone.state !== 2;
            return true;
        });
    });

    constructor() {
        effect(() => {
            this.rows();
            this.viewMode();
            untracked(() => {
                this.#calculateTimeline();
                this.#render();
                if (this.#initialized) {
                    afterNextRender(() => this.scrollToCurrentDate(), { injector: this.#injector });
                }
            });
        });

        effect(() => {
            const user = this.workloadUser();
            if (user) untracked(() => this.#loadWorkloadData());
        });
    }

    ngAfterViewInit() {
        this.#render();
        this.#updateViewportBounds();
        afterNextRender(() => {
            this.#forceRepaint();
            this.#updateViewportBounds();
            this.scrollToCurrentDate();
            this.#initialized = true;
        }, { injector: this.#injector });

        fromEvent<Event>(this.#elementRef.nativeElement, 'scroll')
            .pipe(takeUntilDestroyed(this.#destroyRef))
            .subscribe((event) => {
                this.scrollY.set((event.target as HTMLElement).scrollTop || 0);
                this.#updateViewportBounds();
            });
    }

    #loadWorkloadData() {
        const user = this.workloadUser();
        if (!user) return;

        const start = new Date(this.#timelineStart);
        start.setMonth(start.getMonth() - 1);
        const end = new Date(this.#timelineEnd);
        end.setMonth(end.getMonth() + 1);

        this.#userService.showDailyWorkload(user, dayjs(start).format('YYYY-MM-DD'), dayjs(end).format('YYYY-MM-DD')).subscribe((data) => {
            const workloadData = data as { daily_workload?: DailyWorkload[] };
            this.#workloadMap.clear();
            workloadData.daily_workload?.forEach((day) => this.#workloadMap.set(day.date, day));
            this.#applyWorkloadToTimeline();
        });
    }

    #applyWorkloadToTimeline() {
        this.#timelineUnits.forEach((unit) => (unit.workloadPercent = this.#getWorkloadForUnit(unit)));
        this.#timelineGroups.forEach((group) => (group.workloadPercent = this.#getWorkloadForGroup(group)));
        this.timelineUnits.set([...this.#timelineUnits]);
        this.timelineGroups.set([...this.#timelineGroups]);
    }

    #getWorkloadForUnit(unit: TimelineUnit): number {
        switch (this.viewMode()) {
            case 'Day': {
                const workload = this.#workloadMap.get(dayjs(unit.date).format('YYYY-MM-DD'));
                return workload?.is_break ? -1 : (workload?.total_percent ?? 0);
            }
            case 'Week':
                return this.#getAverageWorkloadForDateRange(unit.date, 7);
            case 'Month':
                return this.#getAverageWorkloadForDateRange(unit.date, new Date(unit.date.getFullYear(), unit.date.getMonth() + 1, 0).getDate());
            case 'Year':
                return this.#getAverageWorkloadForDateRange(new Date(unit.date.getFullYear(), 0, 1), 365);
            default:
                return 0;
        }
    }

    #getWorkloadForGroup(group: TimelineGroup): number {
        const unitsInGroup = this.#timelineUnits.filter((u) => u.x >= group.x && u.x < group.x + group.width);
        if (!unitsInGroup.length) return 0;
        const validUnits = unitsInGroup.filter((u) => (u.workloadPercent ?? 0) >= 0);
        if (!validUnits.length) return 0;
        return validUnits.reduce((acc, u) => acc + (u.workloadPercent ?? 0), 0) / validUnits.length;
    }

    #getAverageWorkloadForDateRange(startDate: Date, days: number): number {
        let totalPercent = 0;
        let validDays = 0;
        for (let i = 0; i < days; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            const workload = this.#workloadMap.get(dayjs(date).format('YYYY-MM-DD'));
            if (workload && !workload.is_break) {
                totalPercent += workload.total_percent;
                validDays++;
            }
        }
        return validDays > 0 ? totalPercent / validDays : 0;
    }

    getWorkloadColor(percent: number | undefined): string {
        if (percent === undefined || percent <= 0) return 'transparent';
        if (percent < 50) return '#2e8b57';
        if (percent < 75) return '#ffd700';
        if (percent < 100) return '#ff8c00';
        if (percent <= 150) return '#dc3545';
        return '#9b59b6';
    }

    #calculateTimeline() {
        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        this.rows().forEach((row) => {
            if (row.type !== 'milestone') return;
            const milestone = row.data as Milestone;
            const startDate = milestone.started_at ? new Date(milestone.started_at) : null;
            const endDate = milestone.due_at ? new Date(milestone.due_at) : null;

            if (startDate) {
                if (!minDate || startDate < minDate) minDate = startDate;
                if (!maxDate || startDate > maxDate) maxDate = startDate;
            }
            if (endDate) {
                if (!minDate || endDate < minDate) minDate = endDate;
                if (!maxDate || endDate > maxDate) maxDate = endDate;
            }
        });

        if (!minDate || !maxDate) {
            minDate = new Date();
            (minDate as Date).setDate(1);
            maxDate = new Date();
            (maxDate as Date).setMonth((maxDate as Date).getMonth() + 3);
        }

        this.#timelineStart = new Date(minDate!);
        this.#timelineStart.setDate(this.#timelineStart.getDate() - 2);
        this.#timelineEnd = new Date(maxDate!);
        this.#timelineEnd.setDate(this.#timelineEnd.getDate() + 2);
        this.#timelineEnd.setMonth(this.#timelineEnd.getMonth() + 1);
        this.#xOffset = 0;

        this.#generateTimeline();
    }

    getWeekNumber(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    }

    #generateTimeline() {
        this.#timelineUnits = [];
        this.#timelineGroups = [];

        switch (this.viewMode()) {
            case 'Day': this.#generateDayTimeline(); break;
            case 'Week': this.#generateWeekTimeline(); break;
            case 'Month': this.#generateMonthTimeline(); break;
            case 'Year': this.#generateYearTimeline(); break;
            default: this.#generateDayTimeline();
        }

        this.#extendTimelineToFillWidth();
        this.#cachedTodayX = this.#calculateTodayX();

        this.timelineUnits.set([...this.#timelineUnits]);
        this.timelineGroups.set([...this.#timelineGroups]);
        this.svgWidth.set(this.svgWidth());
    }

    #extendTimelineToFillWidth() {
        const containerWidth = this.#elementRef.nativeElement.offsetWidth || window.innerWidth;
        if (this.svgWidth() >= containerWidth) {
            this.#applyWorkloadToTimeline();
            return;
        }

        const unitsNeeded = Math.ceil((containerWidth - this.svgWidth()) / this.UNIT_WIDTH());
        const leftUnits = Math.floor(unitsNeeded / 2);
        const rightUnits = Math.ceil(unitsNeeded / 2);

        switch (this.viewMode()) {
            case 'Day': this.#extendDayTimeline(leftUnits, rightUnits); break;
            case 'Week': this.#extendWeekTimeline(leftUnits, rightUnits); break;
            case 'Month': this.#extendMonthTimeline(leftUnits, rightUnits); break;
            case 'Year': this.#extendYearTimeline(leftUnits, rightUnits); break;
        }

        this.#applyWorkloadToTimeline();
    }

    #extendDayTimeline(leftUnits: number, rightUnits: number) {
        const leftOffset = leftUnits * this.UNIT_WIDTH();
        this.#timelineUnits.forEach((unit) => (unit.x += leftOffset));

        const firstDate = new Date(this.#timelineUnits[0].date);
        for (let i = leftUnits; i > 0; i--) {
            const newDate = new Date(firstDate);
            newDate.setDate(newDate.getDate() - i);
            this.#timelineUnits.unshift({ date: newDate, x: (leftUnits - i) * this.UNIT_WIDTH(), label: newDate.getDate().toString(), isWeekend: newDate.getDay() === 0 || newDate.getDay() === 6 });
        }

        const lastDate = new Date(this.#timelineUnits[this.#timelineUnits.length - 1].date);
        const lastX = this.#timelineUnits[this.#timelineUnits.length - 1].x;
        for (let i = 1; i <= rightUnits; i++) {
            const newDate = new Date(lastDate);
            newDate.setDate(newDate.getDate() + i);
            this.#timelineUnits.push({ date: newDate, x: lastX + i * this.UNIT_WIDTH(), label: newDate.getDate().toString(), isWeekend: newDate.getDay() === 0 || newDate.getDay() === 6 });
        }

        this.svgWidth.update((w) => w + (leftUnits + rightUnits) * this.UNIT_WIDTH());
        this.#xOffset += leftOffset;
        this.#rebuildDayTimelineGroups();
    }

    #rebuildDayTimelineGroups() {
        this.#timelineGroups = [];
        let currentMonth = -1;
        let currentYear = -1;
        let monthStart = 0;

        this.#timelineUnits.forEach((unit) => {
            const month = unit.date.getMonth();
            const year = unit.date.getFullYear();
            if (month !== currentMonth || year !== currentYear) {
                if (currentMonth !== -1 && this.#timelineGroups.length > 0) {
                    this.#timelineGroups[this.#timelineGroups.length - 1].width = unit.x - monthStart;
                }
                currentMonth = month;
                currentYear = year;
                monthStart = unit.x;
                this.#timelineGroups.push({ label: unit.date.toLocaleDateString('en', { month: 'short', year: 'numeric' }), x: monthStart, width: 0 });
            }
        });

        if (this.#timelineGroups.length > 0) {
            const lastUnit = this.#timelineUnits[this.#timelineUnits.length - 1];
            this.#timelineGroups[this.#timelineGroups.length - 1].width = lastUnit.x + this.UNIT_WIDTH() - this.#timelineGroups[this.#timelineGroups.length - 1].x;
        }
    }

    #extendWeekTimeline(leftUnits: number, rightUnits: number) {
        const leftOffset = leftUnits * this.UNIT_WIDTH();
        this.#timelineUnits.forEach((unit) => (unit.x += leftOffset));

        const firstDate = new Date(this.#timelineUnits[0].date);
        for (let i = leftUnits; i > 0; i--) {
            const newDate = new Date(firstDate);
            newDate.setDate(newDate.getDate() - i * 7);
            this.#timelineUnits.unshift({ date: newDate, x: (leftUnits - i) * this.UNIT_WIDTH(), label: `CW ${this.getWeekNumber(newDate)}`, weekNumber: this.getWeekNumber(newDate) });
        }

        const lastDate = new Date(this.#timelineUnits[this.#timelineUnits.length - 1].date);
        const lastX = this.#timelineUnits[this.#timelineUnits.length - 1].x;
        for (let i = 1; i <= rightUnits; i++) {
            const newDate = new Date(lastDate);
            newDate.setDate(newDate.getDate() + i * 7);
            this.#timelineUnits.push({ date: newDate, x: lastX + i * this.UNIT_WIDTH(), label: `CW ${this.getWeekNumber(newDate)}`, weekNumber: this.getWeekNumber(newDate) });
        }

        this.svgWidth.update((w) => w + (leftUnits + rightUnits) * this.UNIT_WIDTH());
        this.#xOffset += leftOffset;
        this.#rebuildTimelineGroups();
    }

    #extendMonthTimeline(leftUnits: number, rightUnits: number) {
        const leftOffset = leftUnits * this.UNIT_WIDTH();
        this.#timelineUnits.forEach((unit) => (unit.x += leftOffset));

        const firstDate = new Date(this.#timelineUnits[0].date);
        for (let i = leftUnits; i > 0; i--) {
            const newDate = new Date(firstDate);
            newDate.setMonth(newDate.getMonth() - i);
            this.#timelineUnits.unshift({ date: newDate, x: (leftUnits - i) * this.UNIT_WIDTH(), label: newDate.toLocaleDateString('en', { month: 'short' }) });
        }

        const lastDate = new Date(this.#timelineUnits[this.#timelineUnits.length - 1].date);
        const lastX = this.#timelineUnits[this.#timelineUnits.length - 1].x;
        for (let i = 1; i <= rightUnits; i++) {
            const newDate = new Date(lastDate);
            newDate.setMonth(newDate.getMonth() + i);
            this.#timelineUnits.push({ date: newDate, x: lastX + i * this.UNIT_WIDTH(), label: newDate.toLocaleDateString('en', { month: 'short' }) });
        }

        this.svgWidth.update((w) => w + (leftUnits + rightUnits) * this.UNIT_WIDTH());
        this.#xOffset += leftOffset;
        this.#rebuildTimelineGroups();
    }

    #rebuildTimelineGroups() {
        this.#timelineGroups = [];
        let currentYear = -1;
        let yearStart = 0;

        this.#timelineUnits.forEach((unit) => {
            const year = unit.date.getFullYear();
            if (year !== currentYear) {
                if (currentYear !== -1 && this.#timelineGroups.length > 0) {
                    this.#timelineGroups[this.#timelineGroups.length - 1].width = unit.x - yearStart;
                }
                currentYear = year;
                yearStart = unit.x;
                this.#timelineGroups.push({ label: year.toString(), x: yearStart, width: 0 });
            }
        });

        if (this.#timelineGroups.length > 0) {
            const lastUnit = this.#timelineUnits[this.#timelineUnits.length - 1];
            this.#timelineGroups[this.#timelineGroups.length - 1].width = lastUnit.x + this.UNIT_WIDTH() - this.#timelineGroups[this.#timelineGroups.length - 1].x;
        }
    }

    #extendYearTimeline(leftUnits: number, rightUnits: number) {
        const leftOffset = leftUnits * this.UNIT_WIDTH();
        this.#timelineUnits.forEach((unit) => (unit.x += leftOffset));

        const firstDate = new Date(this.#timelineUnits[0].date);
        for (let i = leftUnits; i > 0; i--) {
            const newDate = new Date(firstDate);
            newDate.setFullYear(newDate.getFullYear() - i);
            this.#timelineUnits.unshift({ date: newDate, x: (leftUnits - i) * this.UNIT_WIDTH(), label: newDate.getFullYear().toString() });
        }

        const lastDate = new Date(this.#timelineUnits[this.#timelineUnits.length - 1].date);
        const lastX = this.#timelineUnits[this.#timelineUnits.length - 1].x;
        for (let i = 1; i <= rightUnits; i++) {
            const newDate = new Date(lastDate);
            newDate.setFullYear(newDate.getFullYear() + i);
            this.#timelineUnits.push({ date: newDate, x: lastX + i * this.UNIT_WIDTH(), label: newDate.getFullYear().toString() });
        }

        this.svgWidth.update((w) => w + (leftUnits + rightUnits) * this.UNIT_WIDTH());
        this.#xOffset += leftOffset;
    }

    #generateDayTimeline() {
        const currentDate = new Date(this.#timelineStart);
        let x = 0;
        let currentMonth = -1;
        let monthStart = 0;

        while (currentDate <= this.#timelineEnd) {
            const month = currentDate.getMonth();
            this.#timelineUnits.push({ date: new Date(currentDate), x, label: currentDate.getDate().toString(), isWeekend: currentDate.getDay() === 0 || currentDate.getDay() === 6 });

            if (month !== currentMonth) {
                if (currentMonth !== -1) this.#timelineGroups[this.#timelineGroups.length - 1].width = x - monthStart;
                currentMonth = month;
                monthStart = x;
                this.#timelineGroups.push({ label: currentDate.toLocaleDateString('en', { month: 'short', year: 'numeric' }), x: monthStart, width: 0 });
            }

            x += this.UNIT_WIDTH();
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (this.#timelineGroups.length) this.#timelineGroups[this.#timelineGroups.length - 1].width = x - monthStart;
        this.svgWidth.set(x);
    }

    #generateWeekTimeline() {
        const currentDate = new Date(this.#timelineStart);
        const day = currentDate.getDay();
        currentDate.setDate(currentDate.getDate() - day + (day === 0 ? -6 : 1));

        let x = 0;
        let currentYear = -1;
        let yearStart = 0;

        while (currentDate <= this.#timelineEnd) {
            const weekNum = this.getWeekNumber(currentDate);
            const year = currentDate.getFullYear();

            this.#timelineUnits.push({ date: new Date(currentDate), x, label: `CW ${weekNum}`, weekNumber: weekNum });

            if (year !== currentYear) {
                if (currentYear !== -1) this.#timelineGroups[this.#timelineGroups.length - 1].width = x - yearStart;
                currentYear = year;
                yearStart = x;
                this.#timelineGroups.push({ label: year.toString(), x: yearStart, width: 0 });
            }

            x += this.UNIT_WIDTH();
            currentDate.setDate(currentDate.getDate() + 7);
        }

        if (this.#timelineGroups.length) this.#timelineGroups[this.#timelineGroups.length - 1].width = x - yearStart;
        this.svgWidth.set(x);
    }

    #generateMonthTimeline() {
        const currentDate = new Date(this.#timelineStart);
        currentDate.setDate(1);

        let x = 0;
        let currentYear = -1;
        let yearStart = 0;

        while (currentDate <= this.#timelineEnd) {
            const year = currentDate.getFullYear();
            this.#timelineUnits.push({ date: new Date(currentDate), x, label: currentDate.toLocaleDateString('en', { month: 'short' }) });

            if (year !== currentYear) {
                if (currentYear !== -1) this.#timelineGroups[this.#timelineGroups.length - 1].width = x - yearStart;
                currentYear = year;
                yearStart = x;
                this.#timelineGroups.push({ label: year.toString(), x: yearStart, width: 0 });
            }

            x += this.UNIT_WIDTH();
            currentDate.setMonth(currentDate.getMonth() + 1);
        }

        if (this.#timelineGroups.length) this.#timelineGroups[this.#timelineGroups.length - 1].width = x - yearStart;
        this.svgWidth.set(x);
    }

    #generateYearTimeline() {
        const currentDate = new Date(this.#timelineStart);
        currentDate.setMonth(0, 1);
        let x = 0;

        while (currentDate <= this.#timelineEnd) {
            this.#timelineUnits.push({ date: new Date(currentDate), x, label: currentDate.getFullYear().toString() });
            x += this.UNIT_WIDTH();
            currentDate.setFullYear(currentDate.getFullYear() + 1);
        }

        this.svgWidth.set(x);
    }

    #render() {
        this.#renderedMilestones = [];
        let currentY = this.TIMELINE_HEADER_HEIGHT;

        this.visibleRows().forEach((row, rowIndex) => {
            if (row.type === 'header') {
                currentY += this.HEADER_ROW_HEIGHT;
            } else if (row.type === 'milestone') {
                const milestone = row.data as Milestone;
                if (milestone.startDate() && milestone.endDate()) {
                    const x = this.#dateToX(milestone.startDate()!);
                    const width = this.#dateToX(milestone.endDate()!) - x;
                    this.#renderedMilestones.push({ milestone, x, width: Math.max(width, 30), y: currentY, rowIndex });
                }
                currentY += this.MILESTONE_ROW_HEIGHT;
            } else if (row.type === 'task') {
                currentY += this.TASK_HEIGHT;
            }
        });

        this.svgHeight.set(currentY + 20);
        this.#extractDependencies();

        this.renderedMilestones.set([...this.#renderedMilestones]);
        this.dependencies.set([...this.#deps]);
    }

    #updateMilestonePosition(milestone: Milestone) {
        const rendered = this.#renderedMilestones.find((rm) => rm.milestone.id === milestone.id);
        if (!rendered) return;
        const startDate = milestone.started_at ? new Date(milestone.started_at) : null;
        const endDate = milestone.due_at
            ? (() => { const d = new Date(milestone.due_at!); d.setHours(23, 59, 59, 999); return d; })()
            : null;
        if (startDate && endDate) {
            rendered.x = this.#dateToX(startDate);
            rendered.width = Math.max(this.#dateToX(endDate) - rendered.x, 30);
        }
        this.renderedMilestones.set([...this.#renderedMilestones]);
    }

    #updateMilestonePositions(milestones: Milestone[]) {
        milestones.forEach((m) => {
            const rendered = this.#renderedMilestones.find((rm) => rm.milestone.id === m.id);
            if (!rendered) return;
            const startDate = m.started_at ? new Date(m.started_at) : null;
            const endDate = m.due_at ? (() => { const d = new Date(m.due_at!); d.setHours(23, 59, 59, 999); return d; })() : null;
            if (startDate && endDate) {
                rendered.x = this.#dateToX(startDate);
                rendered.width = Math.max(this.#dateToX(endDate) - rendered.x, 30);
            }
        });
        this.#extractDependencies();
        this.renderedMilestones.set([...this.#renderedMilestones]);
        this.dependencies.set([...this.#deps]);
    }

    #extractDependencies() {
        this.#deps = [];
        this.#renderedMilestones.forEach((rm) => {
            rm.milestone.dependees?.forEach((dependee) => {
                const dep = dependee as Milestone | number;
                const dependeeId = typeof dep === 'object' && dep.id ? dep.id : dep;
                const fromMilestone = this.#renderedMilestones.find((r) => String(r.milestone.id) === String(dependeeId));
                if (fromMilestone) this.#deps.push({ from: fromMilestone.milestone, to: rm.milestone });
            });
        });
    }

    #dateToX(date: Date): number {
        const timeDiff = date.getTime() - this.#timelineStart.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
        let x = 0;

        switch (this.viewMode()) {
            case 'Day':
                x = daysDiff * this.UNIT_WIDTH();
                break;
            case 'Week': {
                const weekStart = new Date(this.#timelineStart);
                const dow = weekStart.getDay();
                weekStart.setDate(weekStart.getDate() - dow + (dow === 0 ? -6 : 1));
                weekStart.setHours(0, 0, 0, 0);
                x = ((date.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24) / 7) * this.UNIT_WIDTH();
                break;
            }
            case 'Month': {
                const monthsDiff = (date.getFullYear() - this.#timelineStart.getFullYear()) * 12 + (date.getMonth() - this.#timelineStart.getMonth());
                const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
                x = (monthsDiff + (date.getDate() - 1) / daysInMonth) * this.UNIT_WIDTH();
                break;
            }
            case 'Year': {
                const yearsDiff = date.getFullYear() - this.#timelineStart.getFullYear();
                const startOfYear = new Date(date.getFullYear(), 0, 1);
                const endOfYear = new Date(date.getFullYear() + 1, 0, 1);
                x = (yearsDiff + (date.getTime() - startOfYear.getTime()) / (endOfYear.getTime() - startOfYear.getTime())) * this.UNIT_WIDTH();
                break;
            }
            default:
                x = daysDiff * this.UNIT_WIDTH();
        }

        return x + this.#xOffset;
    }

    getRowY(rowIndex: number): number {
        let y = this.TIMELINE_HEADER_HEIGHT;
        const rows = this.visibleRows();
        for (let i = 0; i < rowIndex; i++) {
            const row = rows[i];
            if (row.type === 'header') y += this.HEADER_ROW_HEIGHT;
            else if (row.type === 'milestone') y += this.MILESTONE_ROW_HEIGHT;
            else if (row.type === 'task') y += this.TASK_HEIGHT;
        }
        return y;
    }

    onMilestoneMouseDown(event: MouseEvent, rendered: RenderedMilestone) {
        if (event.button === 2) { event.stopPropagation(); return; }
        if (event.ctrlKey || event.metaKey || event.shiftKey) { event.stopPropagation(); return; }

        event.preventDefault();
        event.stopPropagation();

        this.#draggingMilestone = rendered.milestone;
        this.#dragStartX = event.clientX;
        this.#dragStartDate = rendered.milestone.started_at ? new Date(rendered.milestone.started_at) : null;
        this.#hasMoved = false;

        this.#dragOriginalDates.clear();
        if (rendered.milestone.started_at) {
            this.#dragOriginalDates.set(rendered.milestone.id, { start: new Date(rendered.milestone.started_at), end: rendered.milestone.due_at ? new Date(rendered.milestone.due_at) : null });
        }

        this.#nxService.selected.forEach((nx) => {
            const milestone = nx.nx() as Milestone;
            if (milestone.started_at && milestone.id !== rendered.milestone.id) {
                this.#dragOriginalDates.set(milestone.id, { start: new Date(milestone.started_at), end: milestone.due_at ? new Date(milestone.due_at) : null });
            }
        });

    }

    onBackgroundMouseDown(event: MouseEvent) {
        if (event.button !== 0 || event.ctrlKey || event.metaKey) return;

        const svgRect = this.svgContainer().nativeElement.getBoundingClientRect();
        const x = event.clientX - svgRect.left;
        const y = event.clientY - svgRect.top;

        this.areaSelecting.set(true);
        this.areaSelectStart.set({ x, y });
        this.areaSelectEnd.set({ x, y });
        this.#nxService.deselectAll();
    }

    #finalizeAreaSelection() {
        const start = this.areaSelectStart();
        const end = this.areaSelectEnd();
        const minX = Math.min(start.x, end.x);
        const maxX = Math.max(start.x, end.x);
        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);

        type NxElement = Element & { nx?: Nx };
        Array.from(this.svgContainer().nativeElement.querySelectorAll('.milestone-bar')).forEach((element) => {
            const el = element as NxElement;
            if (!el.nx) return;
            const rendered = this.#renderedMilestones.find((rm) => rm.milestone.id === (el.nx!.nx() as Milestone).id);
            if (!rendered) return;
            const intersects = !(rendered.x + rendered.width < minX || rendered.x > maxX || rendered.y + 40 < minY || rendered.y + 8 > maxY);
            if (intersects) this.#nxService.select(el.nx);
        });
    }

    onDependencyDrawStart(event: MouseEvent, rendered: RenderedMilestone) {
        event.preventDefault();
        event.stopPropagation();
        this.drawingDependency.set(true);
        this.dependencyFromMilestone.set(rendered.milestone);
        this.#dependencyHasMoved = false;

        const svgRect = this.svgContainer().nativeElement.getBoundingClientRect();
        const x = event.clientX - svgRect.left;
        const y = event.clientY - svgRect.top;
        this.#updateDependencyDrawingPath(x, y);
    }

    onResizeMouseDown(event: MouseEvent, rendered: RenderedMilestone, side: 'left' | 'right') {
        event.preventDefault();
        event.stopPropagation();

        if (side === 'left') { this.onDependencyDrawStart(event, rendered); return; }

        this.#resizingMilestone = rendered.milestone;
        this.#resizingSide = side;
        this.#dragStartX = event.clientX;
        this.#resizeStartDate = rendered.milestone.started_at ? new Date(rendered.milestone.started_at) : null;
        this.#resizeEndDate = rendered.milestone.due_at ? new Date(rendered.milestone.due_at) : null;
    }

    #applyDeltaToDate(date: Date, deltaUnits: number): Date {
        const result = new Date(date);
        switch (this.viewMode()) {
            case 'Day': result.setDate(result.getDate() + deltaUnits); break;
            case 'Week': result.setDate(result.getDate() + deltaUnits * 7); break;
            case 'Month': result.setMonth(result.getMonth() + deltaUnits); break;
            case 'Year': result.setFullYear(result.getFullYear() + deltaUnits); break;
        }
        return result;
    }

    onMouseMove(event: MouseEvent) {
        if (this.areaSelecting()) {
            const svgRect = this.svgContainer().nativeElement.getBoundingClientRect();
            this.areaSelectEnd.set({ x: event.clientX - svgRect.left, y: event.clientY - svgRect.top });
            return;
        }

        if (this.drawingDependency()) {
            this.#dependencyHasMoved = true;
            const svgRect = this.svgContainer().nativeElement.getBoundingClientRect();
            const x = event.clientX - svgRect.left;
            const y = event.clientY - svgRect.top;
            this.dependencyToMilestone.set(this.#getMilestoneAtPosition(event));
            this.#updateDependencyDrawingPath(x, y);
            return;
        }

        if (!this.#hasMoved && Math.abs(event.clientX - this.#dragStartX) > 5) this.#hasMoved = true;

        if (this.#resizingMilestone && this.#resizeStartDate && this.#resizeEndDate) {
            const deltaUnits = Math.round((event.clientX - this.#dragStartX) / this.UNIT_WIDTH());
            if (this.#resizingSide === 'right') {
                this.#resizingMilestone.due_at = dayjs(this.#applyDeltaToDate(this.#resizeEndDate, deltaUnits)).format('YYYY-MM-DD');
            }
            this.#updateMilestonePosition(this.#resizingMilestone);
            return;
        }

        if (this.#draggingMilestone && this.#dragStartDate) {
            const deltaUnits = Math.round((event.clientX - this.#dragStartX) / this.UNIT_WIDTH());
            const updatedMilestones: Milestone[] = [];

            this.#dragOriginalDates.forEach((originalDates, milestoneId) => {
                const milestone = this.#renderedMilestones.find((rm) => rm.milestone.id === milestoneId)?.milestone;
                if (!milestone) return;
                const newStart = this.#applyDeltaToDate(originalDates.start, deltaUnits);
                milestone.started_at = dayjs(newStart).format('YYYY-MM-DD');
                if (originalDates.end) {
                    const duration = dayjs(originalDates.end).diff(originalDates.start, 'day');
                    const newEnd = new Date(newStart);
                    newEnd.setDate(newEnd.getDate() + duration);
                    milestone.due_at = dayjs(newEnd).format('YYYY-MM-DD');
                }
                updatedMilestones.push(milestone);
            });

            this.#updateMilestonePositions(updatedMilestones);
        }
    }

    onMouseUp() {
        if (this.areaSelecting()) {
            this.#finalizeAreaSelection();
            this.areaSelecting.set(false);
            return;
        }

        if (this.drawingDependency()) {
            const from = this.dependencyFromMilestone();
            const to = this.dependencyToMilestone();
            if (!this.#dependencyHasMoved && from) {
                this.#removeAllDependencies(from);
            } else if (from && to) {
                this.#createDependency(from, to);
            }
            this.drawingDependency.set(false);
            this.dependencyFromMilestone.set(null);
            this.dependencyToMilestone.set(null);
            this.dependencyDrawingPath.set('');
            this.#dependencyHasMoved = false;
            return;
        }

        if (this.#resizingMilestone) {
            this.#resizingMilestone.update({ due_at: this.#resizingMilestone.due_at }, true).subscribe({
                next: () => Toast.success($localize`:@@i18n.milestone.updated:Milestone updated successfully`),
                error: () => Toast.error($localize`:@@i18n.milestone.updateError:Failed to update milestone`),
            });
            this.#resizingMilestone = null;
            this.#resizingSide = null;
            this.#resizeStartDate = null;
            this.#resizeEndDate = null;
        }

        if (this.#draggingMilestone) {
            if (this.#hasMoved) {
                this.#dragOriginalDates.forEach((_, milestoneId) => {
                    const milestone = this.#renderedMilestones.find((rm) => rm.milestone.id === milestoneId)?.milestone;
                    if (milestone) {
                        milestone.update({ started_at: milestone.started_at, due_at: milestone.due_at }, true).subscribe({
                            error: () => Toast.error($localize`:@@i18n.milestone.updateError:Failed to update milestone`),
                        });
                    }
                });
            }
            this.#draggingMilestone = null;
            this.#dragStartDate = null;
            this.#dragOriginalDates.clear();
        }

        this.#hasMoved = false;
    }

    #getMilestoneAtPosition(event: MouseEvent): Milestone | null {
        const svgRect = this.svgContainer().nativeElement.getBoundingClientRect();
        const x = event.clientX - svgRect.left;
        const y = event.clientY - svgRect.top;

        for (const rendered of this.#renderedMilestones) {
            const barY = rendered.y + 8;
            if (x >= rendered.x && x <= rendered.x + rendered.width && y >= barY && y <= barY + 32) return rendered.milestone;
        }
        return null;
    }

    #removeAllDependencies(milestone: Milestone) {
        if (!milestone.dependees?.length) {
            Toast.info($localize`:@@i18n.milestone.noDependencies:This milestone has no dependencies`);
            return;
        }

        const dependeeIds = milestone.dependees.map((dep) => { const d = dep as Milestone | number; return typeof d === 'object' && d.id ? Number(d.id) : Number(d); });
        this.#milestoneService.removeDependencies(Number(milestone.id), dependeeIds).subscribe({
            next: () => {
                milestone.dependees = [];
                this.#extractDependencies();
                this.dependencies.set([...this.#deps]);
                Toast.success($localize`:@@i18n.milestone.dependenciesRemoved:All dependencies removed`);
            },
            error: () => Toast.error($localize`:@@i18n.milestone.removeDependenciesError:Failed to remove dependencies`),
        });
    }

    #createDependency(from: Milestone, to: Milestone) {
        if (from.id === to.id) { Toast.error($localize`:@@i18n.milestone.cannotDependOnSelf:Cannot create dependency to the same milestone`); return; }
        if (from.project_id !== to.project_id) { Toast.error($localize`:@@i18n.milestone.dependencySameProject:Dependencies can only be created between milestones of the same project`); return; }
        if (from.dependees?.some((id) => String(id as Milestone | number) === String(to.id))) { Toast.error($localize`:@@i18n.milestone.dependencyExists:This dependency already exists`); return; }

        this.#milestoneService.addDependency(Number(from.id), Number(to.id)).subscribe({
            next: () => {
                if (!from.dependees) from.dependees = [];
                from.dependees.push(to);

                if (to.due_at && from.started_at) {
                    const toEndDate = new Date(to.due_at);
                    const fromStartDate = new Date(from.started_at);
                    if (fromStartDate < toEndDate) {
                        from.started_at = dayjs(toEndDate).format('YYYY-MM-DD');
                        if (from.due_at) {
                            const duration = dayjs(from.due_at).diff(fromStartDate, 'day');
                            const newEnd = new Date(toEndDate);
                            newEnd.setDate(newEnd.getDate() + duration);
                            from.due_at = dayjs(newEnd).format('YYYY-MM-DD');
                        }
                        this.#updateMilestonePosition(from);
                        from.update({ started_at: from.started_at, due_at: from.due_at }, true).subscribe({
                            error: () => Toast.error($localize`:@@i18n.milestone.updateError:Failed to update milestone`),
                        });
                    }
                }

                this.#extractDependencies();
                this.dependencies.set([...this.#deps]);
                Toast.success($localize`:@@i18n.milestone.dependencyCreated:Dependency created successfully`);
            },
            error: () => Toast.error($localize`:@@i18n.milestone.dependencyError:Failed to create dependency`),
        });
    }

    getMilestoneColor = (milestone: Milestone) => milestone.state === 2 ? Color.fromVar('success').toHexString() : '#333';
    getMilestoneProgressColor = (milestone: Milestone) => milestone.state === 2 ? 'rgba(255, 255, 255, 0.3)' : Color.fromVar('primary').toHexString();
    getMilestoneLabelColor = (milestone: Milestone) => milestone.state === 2 || milestone.state === 1 ? '#ffffff' : '#cccccc';

    decodeHtmlEntities(text: string): string {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = text;
        return textarea.value;
    }

    getDependencyPath(dep: Dependency): string {
        const fromRendered = this.#renderedMilestones.find((r) => r.milestone.id === dep.from.id);
        const toRendered = this.#renderedMilestones.find((r) => r.milestone.id === dep.to.id);
        if (!fromRendered || !toRendered) return '';

        const x1 = fromRendered.x + fromRendered.width;
        const y1 = fromRendered.y + this.MILESTONE_ROW_HEIGHT / 2;
        const x2 = toRendered.x;
        const y2 = toRendered.y + this.MILESTONE_ROW_HEIGHT / 2;
        const halfGrid = this.UNIT_WIDTH() / 2;

        if (dep.from.due_at && dep.to.started_at && dep.from.due_at === dep.to.started_at) {
            const midY = (y1 + y2) / 2;
            return `M ${x1} ${y1} L ${x1 + halfGrid} ${y1} L ${x1 + halfGrid} ${midY} L ${x2 - halfGrid} ${midY} L ${x2 - halfGrid} ${y2} L ${x2} ${y2}`;
        }

        if (x2 - x1 < halfGrid * 2) {
            const midY = (y1 + y2) / 2;
            return `M ${x1} ${y1} L ${x1 + halfGrid} ${y1} L ${x1 + halfGrid} ${midY} L ${x2 - halfGrid} ${midY} L ${x2 - halfGrid} ${y2} L ${x2} ${y2}`;
        }

        return `M ${x1} ${y1} L ${x1 + halfGrid} ${y1} L ${x1 + halfGrid} ${y2} L ${x2 - halfGrid} ${y2} L ${x2} ${y2}`;
    }

    #updateDependencyDrawingPath(mouseX: number, mouseY: number) {
        const from = this.dependencyFromMilestone();
        if (!this.drawingDependency() || !from) { this.dependencyDrawingPath.set(''); return; }

        const fromRendered = this.#renderedMilestones.find((r) => r.milestone.id === from.id);
        if (!fromRendered) { this.dependencyDrawingPath.set(''); return; }

        const x1 = fromRendered.x;
        const y1 = fromRendered.y + this.MILESTONE_ROW_HEIGHT / 2;
        let x2 = mouseX;
        let y2 = mouseY;

        const to = this.dependencyToMilestone();
        if (to) {
            const toRendered = this.#renderedMilestones.find((r) => r.milestone.id === to.id);
            if (toRendered) { x2 = toRendered.x; y2 = toRendered.y + this.MILESTONE_ROW_HEIGHT / 2; }
        }

        const midX = (x1 + x2) / 2;
        this.dependencyDrawingPath.set(`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    }

    navigateToProject = (project: Project) => this.#router.navigate(['/projects', project.id, 'milestones']);

    onDropdownOpenChange() {
        afterNextRender(() => this.#forceRepaint(), { injector: this.#injector });
    }

    toggleHideCompleted() {
        this.hideCompleted.update((v) => !v);
        storageSet('gantt.hideCompleted', this.hideCompleted());
        this.#render();
    }

    onAddMilestoneClick(project: Project, dropdown: NgbDropdown, event: MouseEvent) {
        event.stopPropagation();
        this.addMilestone.emit(project);
        dropdown.close();
    }

    onAddTaskClick(project: Project, dropdown: NgbDropdown, event: MouseEvent) {
        event.stopPropagation();
        this.addTask.emit(project);
        dropdown.close();
    }

    getProjectDurationBar(project: Project): { x: number; width: number; label: string } | null {
        const projectMilestones = this.#renderedMilestones.filter((rm) => rm.milestone.project_id === project.id);
        if (!projectMilestones.length) return null;

        const dates: Date[] = [];
        projectMilestones.forEach((rm) => {
            if (rm.milestone.started_at) dates.push(new Date(rm.milestone.started_at));
            if (rm.milestone.due_at) dates.push(new Date(rm.milestone.due_at));
        });

        if (!dates.length) return null;

        const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
        const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
        const durationDays = Math.ceil((latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24));

        let label = `${durationDays}d`;
        if (durationDays >= 7) label = `${Math.floor(durationDays / 7)}w`;
        if (durationDays >= 30) label = `${Math.floor(durationDays / 30)}mo`;
        if (durationDays >= 365) label = `${Math.floor(durationDays / 365)}y`;

        return { x: this.#dateToX(earliest), width: this.#dateToX(latest) - this.#dateToX(earliest), label };
    }

    #calculateTodayX(): number {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        let periodStart: Date;
        let periodEnd: Date;

        switch (this.viewMode()) {
            case 'Day':
                periodStart = today;
                periodEnd = new Date(today);
                periodEnd.setDate(periodEnd.getDate() + 1);
                break;
            case 'Week': {
                periodStart = new Date(today);
                const day = periodStart.getDay();
                periodStart.setDate(periodStart.getDate() - day + (day === 0 ? -6 : 1));
                periodStart.setHours(0, 0, 0, 0);
                periodEnd = new Date(periodStart);
                periodEnd.setDate(periodEnd.getDate() + 7);
                break;
            }
            case 'Month':
                periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
                periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
                break;
            case 'Year':
                periodStart = new Date(today.getFullYear(), 0, 1);
                periodEnd = new Date(today.getFullYear() + 1, 0, 1);
                break;
            default:
                return this.#dateToX(today);
        }

        const progress = (now.getTime() - periodStart.getTime()) / (periodEnd.getTime() - periodStart.getTime());

        if (this.viewMode() === 'Week') {
            const tlStart = new Date(this.#timelineStart);
            const dow = tlStart.getDay();
            tlStart.setDate(tlStart.getDate() - dow + (dow === 0 ? -6 : 1));
            tlStart.setHours(0, 0, 0, 0);
            const weeksDiff = Math.round((periodStart.getTime() - tlStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
            return this.#xOffset + weeksDiff * this.UNIT_WIDTH() + progress * this.UNIT_WIDTH();
        }
        return this.#dateToX(periodStart) + progress * this.UNIT_WIDTH();
    }

    getTodayX = () => this.#cachedTodayX;

    getProjectDeadlines(): { project: Project; x: number; yStart: number; yEnd: number }[] {
        const deadlines: { project: Project; x: number; yStart: number; yEnd: number }[] = [];
        const projectRowRanges = new Map<string, { project: Project; startRow: number; endRow: number }>();
        const rows = this.visibleRows();

        rows.forEach((row, index) => {
            if (!row.project) return;
            const projectId = String(row.project.id);
            if (!projectRowRanges.has(projectId)) {
                projectRowRanges.set(projectId, { project: row.project, startRow: index, endRow: index });
            } else {
                projectRowRanges.get(projectId)!.endRow = index;
            }
        });

        projectRowRanges.forEach((range) => {
            if (!range.project.due_at) return;
            const x = this.#dateToX(new Date(range.project.due_at));
            deadlines.push({ project: range.project, x, yStart: this.getRowY(range.startRow), yEnd: this.getRowY(range.endRow) + this.#getRowHeight(rows[range.endRow]) });
        });

        return deadlines;
    }

    #getRowHeight(row: GanttRow): number {
        if (row.type === 'header') return this.HEADER_ROW_HEIGHT;
        if (row.type === 'milestone') return this.MILESTONE_ROW_HEIGHT;
        if (row.type === 'task') return this.TASK_HEIGHT;
        return 0;
    }

    getAvatarUrl = (userId: string) => `${environment.envApi}users/${userId}/icon`;

    getTaskX(row: GanttRow): number {
        if (row.type !== 'task') return 0;
        const rows = this.visibleRows();
        const rowIndex = rows.indexOf(row);
        for (let i = rowIndex - 1; i >= 0; i--) {
            if (rows[i].type === 'milestone') {
                const rendered = this.#renderedMilestones.find((rm) => String(rm.milestone.id) === String(rows[i].data.id));
                return rendered?.x ?? 0;
            }
            if (rows[i].type === 'header') break;
        }
        return 0;
    }

    getTaskWidth(row: GanttRow): number {
        if (row.type !== 'task') return 200;
        const rows = this.visibleRows();
        const rowIndex = rows.indexOf(row);
        for (let i = rowIndex - 1; i >= 0; i--) {
            if (rows[i].type === 'milestone') {
                const rendered = this.#renderedMilestones.find((rm) => String(rm.milestone.id) === String(rows[i].data.id));
                return rendered?.width ?? 200;
            }
            if (rows[i].type === 'header') break;
        }
        return 200;
    }

    #updateViewportBounds() {
        const container = this.#elementRef.nativeElement;
        this.viewportLeft.set(container.scrollLeft);
        this.viewportRight.set(container.scrollLeft + container.clientWidth);
    }

    getOffScreenIndicators(): { rowIndex: number; hasLeft: boolean; hasRight: boolean; y: number; isOverdue: boolean }[] {
        const vl = this.viewportLeft();
        const vr = this.viewportRight();
        return this.visibleRows()
            .map((row, rowIndex) => {
                if (row.type !== 'milestone') return null;
                const rowMilestone = this.#renderedMilestones.find((rm) => rm.milestone.id === row.data.id);
                if (!rowMilestone) return null;

                const hasLeft = rowMilestone.x + rowMilestone.width < vl;
                const hasRight = rowMilestone.x > vr;
                if (!hasLeft && !hasRight) return null;

                return { rowIndex, hasLeft, hasRight, y: this.getRowY(rowIndex) + this.MILESTONE_ROW_HEIGHT / 2, isOverdue: this.#isMilestoneOverdue(rowMilestone.milestone) };
            })
            .filter((x): x is NonNullable<typeof x> => x !== null);
    }

    #isMilestoneOverdue(milestone: Milestone): boolean {
        if (!milestone.due_at || milestone.state === 2) return false;
        const dueDate = new Date(milestone.due_at);
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < now;
    }

    isMilestoneOverdue = (milestone: Milestone) => this.#isMilestoneOverdue(milestone);

    onTaskCheckboxChange(task: Task, event: Event) {
        const checked = (event.target as HTMLInputElement).checked;
        if (checked) {
            task.httpService?.close(task).subscribe({
                next: () => {
                    task.state = 1;
                    this.#setTaskState(this.#disappearingTasks, task.id, false);
                    this.#setTaskState(this.#completingTasks, task.id, true);
                },
                error: () => Toast.error($localize`:@@i18n.task.closeError:Failed to close task`),
            });
        } else {
            this.#setTaskState(this.#completingTasks, task.id, false);
            this.#setTaskState(this.#disappearingTasks, task.id, false);
            task.httpService?.reopen(task).subscribe({
                next: () => (task.state = 0),
                error: () => Toast.error($localize`:@@i18n.task.reopenError:Failed to reopen task`),
            });
        }
    }

    onTaskLabelAnimationEnd(taskId: string, event: AnimationEvent) {
        if (event.animationName !== 'task-disappear' || !this.#completingTasks().has(taskId)) {
            return;
        }
        this.#setTaskState(this.#completingTasks, taskId, false);
        this.#setTaskState(this.#disappearingTasks, taskId, true);
    }

    onTaskContextMenu(event: MouseEvent, task: Task) {
        event.preventDefault();
        event.stopPropagation();

        const row = this.rows().find((r) => r.type === 'task' && r.data.id === task.id);
        const mockNxObject = {
            nx: task,
            tables: this.rows().filter((r) => r.type === 'task').map((r) => r.data),
            context: 'task',
            nxContext: { project: row?.project },
            selected: false,
            el: { nativeElement: this.svgContainer().nativeElement },
            get nxAttribute() { return this; },
            get classActive() { return this.selected; },
            setSelected: (selected: boolean) => { mockNxObject.selected = selected; return selected; },
            toggleSelected: () => { mockNxObject.selected = !mockNxObject.selected; return mockNxObject.selected; },
        };

        this.#nxService.onRightClick(mockNxObject as any, event);
    }

    isTaskDisappearing = (taskId: string) => this.#disappearingTasks().has(taskId);
    isTaskCompleting = (taskId: string) => this.#completingTasks().has(taskId);

    #setTaskState(target: ReturnType<typeof signal<Set<string>>>, taskId: string, enabled: boolean) {
        target.update((current) => {
            const next = new Set(current);
            if (enabled) {
                next.add(taskId);
            } else {
                next.delete(taskId);
            }
            return next;
        });
    }

    #forceRepaint() {
        requestAnimationFrame(() => {
            const host = this.#elementRef.nativeElement;
            const scrollLeft = host.scrollLeft;
            host.scrollLeft = scrollLeft + 1;
            host.scrollLeft = scrollLeft;
        });
    }

    scrollToCurrentDate() {
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        let currentX = 0;
        let found = false;

        switch (this.viewMode()) {
            case 'Day': {
                const todayUnit = this.#timelineUnits.find((unit) => { const d = new Date(unit.date); d.setHours(0, 0, 0, 0); return d.getTime() === now.getTime(); });
                if (todayUnit) { currentX = todayUnit.x; found = true; }
                break;
            }
            case 'Week': {
                const currentWeek = this.getWeekNumber(now);
                const weekUnit = this.#timelineUnits.find((u) => u.weekNumber === currentWeek && u.date.getFullYear() === now.getFullYear());
                if (weekUnit) { currentX = weekUnit.x; found = true; }
                break;
            }
            case 'Month': {
                const monthUnit = this.#timelineUnits.find((u) => u.date.getMonth() === now.getMonth() && u.date.getFullYear() === now.getFullYear());
                if (monthUnit) { currentX = monthUnit.x; found = true; }
                break;
            }
            case 'Year': {
                const yearUnit = this.#timelineUnits.find((u) => u.date.getFullYear() === now.getFullYear());
                if (yearUnit) { currentX = yearUnit.x; found = true; }
                break;
            }
        }

        if (found) {
            const host = this.#elementRef.nativeElement;
            host.scrollLeft = Math.max(0, currentX - host.clientWidth / 2 + this.UNIT_WIDTH() / 2);
        }
    }
}
