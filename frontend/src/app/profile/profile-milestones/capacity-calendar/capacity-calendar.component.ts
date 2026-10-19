import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NgbPopover, NgbPopoverModule, NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap';
import { CdkDropList, CdkDragDrop } from '@angular/cdk/drag-drop';
import { dayjs, Dayjs } from '@constants/date/dates';
import { Color } from '@constants/Color';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { Milestone } from '@models/milestone/milestone.model';
import { MilestoneState } from '@models/milestone/milestone-state.enum';
import { CalendarEventDto, DailyWorkloadDto, DailyWorkloadElementDto, WorkloadDataDto } from '@models/_core/api-response';
import { Nx } from '@app/nx/nx.directive';

export type PlannerEvent = CalendarEventDto & { color: string };

interface BarSegment {
    startCol: number; // first visible day column the bar occupies in this week
    span: number; // number of visible day columns the bar covers within this week
    lane: number; // vertical stacking lane to avoid overlap
    continuesLeft: boolean; // bar started in an earlier week
    continuesRight: boolean; // bar ends in a later week
}

export interface MilestoneBar extends BarSegment {
    milestone: Milestone;
    color: string;
}

export interface EventBar extends BarSegment {
    event: PlannerEvent;
}

export interface WeekRow {
    weekNumber: number;
    monthLabel?: string;
    days: (DailyWorkloadDto | null)[];
    bars: MilestoneBar[];
    eventBars: EventBar[];
    laneCount: number;
    distinctProjectCount: number;
}

export interface CapacityCalendarDrop {
    date: string;
    item: unknown;
}

export interface MilestoneReschedule {
    milestone: Milestone;
    started_at: string;
    due_at: string;
}

type DragMode = 'move' | 'resize-start' | 'resize-end';
interface DragState {
    milestone: Milestone;
    mode: DragMode;
    dayDelta: number;
    weekDelta: number;
    originStart: ReturnType<typeof dayjs>;
    originDue: ReturnType<typeof dayjs>;
    pointerStartX: number;
    colWidth: number;
    rowTops: number[];
    startRowIndex: number;
}

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'capacity-calendar',
    templateUrl: './capacity-calendar.component.html',
    styleUrls: ['./capacity-calendar.component.scss'],
    imports: [DecimalPipe, NgbPopoverModule, NgbTooltipModule, AvatarComponent, CdkDropList, Nx],
})
export class CapacityCalendarComponent {
    #elementRef = inject(ElementRef<HTMLElement>);

    constructor() {
        inject(DestroyRef).onDestroy(() => this.#listenToDocument(false));
    }

    workloadData = input.required<WorkloadDataDto>();
    milestones = input<Milestone[]>([]);
    events = input<PlannerEvent[]>([]);
    showWeekend = input(false);

    itemDropped = output<CapacityCalendarDrop>();
    editMilestone = output<Milestone>();
    milestoneRescheduled = output<MilestoneReschedule>();
    milestoneUnscheduled = output<Milestone>();
    draggingChange = output<boolean>();
    addMilestoneForDay = output<string>();

    readonly columns = computed(() => (this.showWeekend() ? 7 : 5));
    readonly dayLabels = computed(() => ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].slice(0, this.columns()));

    #drag = signal<DragState | null>(null);

    readonly weeks = computed<WeekRow[]>(() => this.#buildWeeks(this.workloadData(), this.milestones(), this.events(), this.#drag(), this.columns()));

    readonly overdueMilestones = computed<Milestone[]>(() => {
        const startDate = dayjs(this.workloadData().start_date);
        return this.milestones().filter((m) => m.due_at && dayjs(m.due_at).isBefore(startDate, 'day') && this.isMilestoneOverdue(m));
    });

    dropListId = (day: DailyWorkloadDto): string => `capacity-day-${day.date}`;

    onDrop(day: DailyWorkloadDto, event: CdkDragDrop<DailyWorkloadDto>): void {
        this.itemDropped.emit({ date: day.date, item: event.item.data });
    }

    loadWidth = (day: DailyWorkloadDto): string => `${Math.min(day.total_percent, 100)}%`;
    loadClass = (day: DailyWorkloadDto): string => (day.total_percent >= 100 ? 'bg-danger' : day.total_percent >= 75 ? 'bg-warning' : 'bg-success');
    loadTooltip = (day: DailyWorkloadDto): string => `${day.total_hours.toFixed(1)} / ${day.available_hours}h · ${Math.round(day.total_percent)}%`;

    isToday = (day: DailyWorkloadDto | null): boolean => day?.date === dayjs().format('YYYY-MM-DD');
    dayNumber = (day: DailyWorkloadDto): number => dayjs(day.date).date();
    eventTooltip = (event: PlannerEvent): string => (event.all_day ? event.title : `${dayjs(event.start).format('HH:mm')}–${dayjs(event.end).format('HH:mm')} ${event.title}`);
    fragmentationDots = (day: DailyWorkloadDto): number[] => Array.from({ length: Math.min(day.distinct_project_count, 5) });

    barLeft = (bar: BarSegment): string => `${(bar.startCol / this.columns()) * 100}%`;
    barWidth = (bar: BarSegment): string => `${(bar.span / this.columns()) * 100}%`;

    isMilestoneDone = (milestone: Milestone): boolean => milestone.state === MilestoneState.DONE;
    isMilestoneOverdue = (milestone: Milestone): boolean => !this.isMilestoneDone(milestone) && !!milestone.due_at && dayjs().isAfter(milestone.due_at, 'day');
    /** Still TODO although the planned start date has already passed. */
    isMilestoneLateStart = (milestone: Milestone): boolean =>
        milestone.state === MilestoneState.TODO && !this.isMilestoneOverdue(milestone) && !!milestone.started_at && dayjs().isAfter(milestone.started_at, 'day');
    /** TODO and its planned start date hasn't arrived yet. */
    isMilestoneNotStarted = (milestone: Milestone): boolean => milestone.state === MilestoneState.TODO && !this.isMilestoneLateStart(milestone) && !this.isMilestoneOverdue(milestone);

    milestoneTooltip = (milestone: Milestone): string => {
        if (this.isMilestoneOverdue(milestone)) return $localize`:@@i18n.planner.milestoneOverdue:${milestone.name} — overdue`;
        if (this.isMilestoneLateStart(milestone)) return $localize`:@@i18n.planner.milestoneLateStart:${milestone.name} — not started yet, planned start date has passed`;
        return milestone.name;
    };

    barTooltip = (bar: MilestoneBar): string => this.milestoneTooltip(bar.milestone);

    dueDateLabel = (milestone: Milestone): string => dayjs(milestone.due_at).format('MMM D');

    trackByWeek = (_index: number, week: WeekRow): number => week.weekNumber;
    trackByElement = (_index: number, element: DailyWorkloadElementDto): string => `${element.type}-${element.id}`;
    trackByBar = (_index: number, bar: MilestoneBar): string => bar.milestone.id;

    onAddClick(day: DailyWorkloadDto, popover: NgbPopover): void {
        popover.close();
        this.addMilestoneForDay.emit(day.date);
    }

    onBarClick(bar: MilestoneBar, event: MouseEvent): void {
        if (this.#suppressClick) {
            this.#suppressClick = false;
            return;
        }
        event.stopPropagation();
        this.editMilestone.emit(bar.milestone);
    }

    #suppressClick = false;

    onBarPointerDown(bar: MilestoneBar, mode: DragMode, event: PointerEvent): void {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const weekRow = (event.target as HTMLElement).closest('.week-row') as HTMLElement | null;
        const weekBody = (event.target as HTMLElement).closest('.week-body') as HTMLElement | null;
        const colWidth = weekBody ? weekBody.clientWidth / this.columns() : 1;
        const rowEls = (this.#elementRef.nativeElement as HTMLElement).querySelectorAll('.week-row');
        const rowTops = Array.from(rowEls).map((el) => (el as HTMLElement).getBoundingClientRect().top);
        const startRowIndex = weekRow ? rowTops.findIndex((top) => Math.abs(top - weekRow.getBoundingClientRect().top) < 1) : -1;
        (event.target as HTMLElement).setPointerCapture?.(event.pointerId);

        this.#drag.set({
            milestone: bar.milestone,
            mode,
            dayDelta: 0,
            weekDelta: 0,
            originStart: bar.milestone.plannedRange()!.start,
            originDue: bar.milestone.plannedRange()!.due,
            pointerStartX: event.clientX,
            colWidth,
            rowTops,
            startRowIndex,
        });
        this.#listenToDocument(true);
        this.draggingChange.emit(true);
    }

    onPointerMove = (event: PointerEvent): void => {
        const drag = this.#drag();
        if (!drag || !this.#elementRef.nativeElement.contains(document.elementFromPoint(event.clientX, event.clientY))) return;
        const dayDelta = Math.round((event.clientX - drag.pointerStartX) / drag.colWidth);
        const weekDelta = drag.mode === 'move' && drag.startRowIndex !== -1 ? this.#rowIndexAt(drag.rowTops, event.clientY) - drag.startRowIndex : 0;
        if (dayDelta !== drag.dayDelta || weekDelta !== drag.weekDelta) this.#drag.set({ ...drag, dayDelta, weekDelta });
    };

    #rowIndexAt(rowTops: number[], clientY: number): number {
        let index = 0;
        for (let i = 0; i < rowTops.length; i++) {
            if (rowTops[i] <= clientY) index = i;
        }
        return index;
    }

    onPointerUp = (event: PointerEvent): void => {
        this.#listenToDocument(false);
        const drag = this.#drag();
        this.#drag.set(null);
        if (!drag) return;
        this.draggingChange.emit(false);
        if (document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-unschedule-target]')) {
            this.#suppressClick = true;
            this.milestoneUnscheduled.emit(drag.milestone);
            return;
        }
        if (drag.dayDelta === 0 && drag.weekDelta === 0) return;

        const { start, due } = this.#applyDrag(drag.originStart, drag.originDue, drag);
        this.#suppressClick = true;
        this.milestoneRescheduled.emit({ milestone: drag.milestone, started_at: start.format('YYYY-MM-DD'), due_at: due.format('YYYY-MM-DD') });
    };

    #listenToDocument(listen: boolean): void {
        const events = [['pointermove', this.onPointerMove], ['pointerup', this.onPointerUp], ['pointercancel', this.onPointerUp]] as const;
        for (const [type, handler] of events) {
            if (listen) document.addEventListener(type, handler);
            else document.removeEventListener(type, handler);
        }
    }

    #applyDrag(start: Dayjs, due: Dayjs, drag: DragState): { start: Dayjs; due: Dayjs } {
        const shift = (date: Dayjs) => this.#shiftColumns(date.add(drag.weekDelta, 'week'), drag.dayDelta);
        if (drag.mode === 'move') return { start: shift(start), due: shift(due) };
        if (drag.mode === 'resize-start') {
            const shifted = shift(start);
            return { start: shifted.isAfter(due) ? due : shifted, due };
        }
        const shifted = shift(due);
        return { start, due: shifted.isBefore(start) ? start : shifted };
    }

    #shiftColumns(date: Dayjs, columns: number): Dayjs {
        if (this.showWeekend()) return date.add(columns, 'day');
        let cursor = date;
        for (let remaining = Math.abs(columns); remaining > 0; ) {
            cursor = cursor.add(Math.sign(columns), 'day');
            if (cursor.isoWeekday() <= 5) remaining--;
        }
        return cursor;
    }

    #buildWeeks(data: WorkloadDataDto, milestones: Milestone[], events: PlannerEvent[], drag: DragState | null, columns: number): WeekRow[] {
        const workloadMap = new Map<string, DailyWorkloadDto>();
        data.daily_workload.forEach((day) => workloadMap.set(day.date, day));

        const startDate = dayjs(data.start_date);
        const endDate = dayjs(data.end_date);
        const dated = milestones.filter((m) => m.plannedRange()).map((m) => this.#withDragApplied(m, drag));
        const datedEvents = events.map((event) => ({ event, ...this.#eventDays(event) }));

        const weeks: WeekRow[] = [];
        let currentWeekStart = startDate.startOf('isoWeek');
        let currentMonth = '';

        while (currentWeekStart.isSameOrBefore(endDate)) {
            const weekStart = currentWeekStart;
            const weekEnd = weekStart.add(columns - 1, 'days');
            const weekDays: (DailyWorkloadDto | null)[] = [];
            const weekNumber = weekStart.isoWeek();
            const weekProjectIds = new Set<string>();
            let monthLabel: string | undefined;

            for (let i = 0; i < columns; i++) {
                const day = weekStart.add(i, 'days');
                const dayStr = day.format('YYYY-MM-DD');
                const dayData = day.isBefore(startDate) || day.isAfter(endDate) ? null : (workloadMap.get(dayStr) ?? null);
                weekDays.push(dayData);
                dayData?.elements.forEach((el) => el.project_id && weekProjectIds.add(el.project_id));

                if (i === 0) {
                    const monthName = day.format('MMM YYYY');
                    if (monthName !== currentMonth) {
                        monthLabel = day.format('MMM');
                        currentMonth = monthName;
                    }
                }
            }

            const laneEnds: number[] = [];
            const eventBars = this.#assignLanes(this.#segmentsForWeek(datedEvents, weekStart, weekEnd), laneEnds);
            const bars = this.#assignLanes(this.#segmentsForWeek(dated, weekStart, weekEnd), laneEnds).map((bar) => ({ ...bar, color: this.#colorFor(bar.milestone) }));
            weeks.push({ weekNumber, monthLabel, days: weekDays, bars, eventBars, laneCount: laneEnds.length, distinctProjectCount: weekProjectIds.size });
            currentWeekStart = weekStart.add(1, 'week');
        }

        return weeks;
    }

    #withDragApplied(milestone: Milestone, drag: DragState | null): { milestone: Milestone; start: Dayjs; due: Dayjs } {
        const { start, due } = milestone.plannedRange()!;
        if (!drag || drag.milestone.id !== milestone.id) return { milestone, start, due };
        return { milestone, ...this.#applyDrag(start, due, drag) };
    }

    #eventDays(event: PlannerEvent): { start: Dayjs; due: Dayjs } {
        const start = dayjs(event.start).startOf('day');
        const due = event.all_day ? dayjs(event.end).subtract(1, 'day') : dayjs(event.end).subtract(1, 'second').startOf('day');
        return { start, due: due.isBefore(start) ? start : due };
    }

    #segmentsForWeek<T extends { start: Dayjs; due: Dayjs }>(items: T[], weekStart: Dayjs, weekEnd: Dayjs): (T & Omit<BarSegment, 'lane'>)[] {
        return items
            .filter(({ start, due }) => !due.isBefore(weekStart, 'day') && !start.isAfter(weekEnd, 'day'))
            .map((item) => {
                const segStart = item.start.isBefore(weekStart) ? weekStart : item.start;
                const segEnd = item.due.isAfter(weekEnd) ? weekEnd : item.due;
                return {
                    ...item,
                    startCol: segStart.diff(weekStart, 'day'),
                    span: Math.max(1, segEnd.diff(segStart, 'day') + 1),
                    continuesLeft: item.start.isBefore(weekStart, 'day'),
                    continuesRight: item.due.isAfter(weekEnd, 'day'),
                };
            })
            .sort((a, b) => a.startCol - b.startCol || b.span - a.span);
    }

    #assignLanes<T extends { startCol: number; span: number }>(segments: T[], laneEnds: number[]): (T & { lane: number })[] {
        return segments.map((seg) => {
            let lane = laneEnds.findIndex((end) => end < seg.startCol);
            if (lane === -1) {
                lane = laneEnds.length;
                laneEnds.push(0);
            }
            laneEnds[lane] = seg.startCol + seg.span - 1;
            return { ...seg, lane };
        });
    }

    #colorFor(milestone: Milestone): string {
        return milestone.project?.color() ?? Color.uniqueColorFromString(String(milestone.project_id ?? milestone.id));
    }
}
