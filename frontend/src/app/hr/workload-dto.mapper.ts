import { Milestone } from '@models/milestone/milestone.model';
import { Project } from '@models/project/project.model';
import { CalendarEventDto, DailyWorkloadDto, DailyWorkloadElementDto, WorkloadDataDto } from '@models/_core/api-response';
import { dayjs } from '@constants/date/dates';

export function mapWorkloadDto(data: WorkloadDataDto | undefined): WorkloadDataDto | null {
    if (!data) return null;
    const daily_workload: DailyWorkloadDto[] = data.daily_workload.map((day) => ({
        ...day,
        elements: day.elements.map((el): DailyWorkloadElementDto => ({ ...el, project: el.project ? Project.fromJson(el.project) : undefined })),
    }));
    return { ...data, daily_workload, unconfigured_milestones: data.unconfigured_milestones.map((_) => Milestone.fromJson(_)) };
}

const WORKDAY_START_HOUR = 8;
const WORKDAY_END_HOUR = 18;

export function withCalendarLoad(data: WorkloadDataDto, busyEvents: CalendarEventDto[]): WorkloadDataDto {
    const timed = busyEvents.filter((e) => !e.all_day).map((e) => [dayjs(e.start).valueOf(), dayjs(e.end).valueOf()]);
    const daily_workload = data.daily_workload.map((day) => {
        if (day.is_break) return day;
        const workStart = dayjs(day.date).hour(WORKDAY_START_HOUR).valueOf();
        const workEnd = dayjs(day.date).hour(WORKDAY_END_HOUR).valueOf();
        const intervals = timed
            .map(([start, end]) => [Math.max(start, workStart), Math.min(end, workEnd)])
            .filter(([start, end]) => end > start)
            .sort((a, b) => a[0] - b[0]);
        let busyMs = 0;
        let cursor = -Infinity;
        for (const [start, end] of intervals) {
            const from = Math.max(start, cursor);
            if (end > from) busyMs += end - from;
            cursor = Math.max(cursor, end);
        }
        const meeting_hours = Math.round((busyMs / 3_600_000) * 100) / 100;
        const total_hours = day.assignment_hours + day.milestone_hours + meeting_hours;
        const total_percent = day.available_hours > 0 ? Math.round((total_hours / day.available_hours) * 1000) / 10 : 0;
        return { ...day, meeting_hours, total_hours, total_percent };
    });
    return { ...data, daily_workload };
}
