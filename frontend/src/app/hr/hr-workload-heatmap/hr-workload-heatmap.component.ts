import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgbPopoverModule } from '@ng-bootstrap/ng-bootstrap';
import { RouterModule } from '@angular/router';
import { User } from '@models/user/user.model';
import { UserService } from '@models/user/user.service';
import { dayjs, shortMonth } from '@constants/date/dates';
import { Nx } from '@app/nx/nx.directive';
import { AvatarComponent } from '@shards/avatar/avatar.component';
import { CompactItemDirective } from '@shards/ul-compact/CompactItemDirective';
import { UlCompactComponent } from '@shards/ul-compact/ul-compact.component';
import { tracked } from '@constants/tracked';
import { DailyWorkloadDto, DailyWorkloadElementDto, WorkloadDataDto } from '@models/_core/api-response';
import { modelResource } from '@models/http/model-resource';
import { mapWorkloadDto } from '../workload-dto.mapper';

interface WeekColumn {
    weekNumber: number;
    monthLabel?: string;
    days: (DailyWorkloadDto | null)[];
}

@Component({
    selector: 'hr-workload-heatmap',
    templateUrl: './hr-workload-heatmap.component.html',
    styleUrls: ['./hr-workload-heatmap.component.scss'],
    imports: [DecimalPipe, FormsModule, NgbPopoverModule, RouterModule, UlCompactComponent, CompactItemDirective, AvatarComponent, Nx, AvatarComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrWorkloadHeatmapComponent {
    readonly user = input.required<User>();
    readonly trackedUser = tracked(this.user);

    #userService = inject(UserService);

    readonly #workload = modelResource(
        () => this.user().id,
        (userId) => this.#userService.showDailyWorkload(userId, dayjs().startOf('day').format('YYYY-MM-DD'), dayjs().add(3, 'months').format('YYYY-MM-DD')),
    );
    readonly data = computed(() => mapWorkloadDto(this.#workload.value()));
    readonly weekColumns = computed(() => {
        const data = this.data();
        return data ? this.#buildWeekColumns(data) : [];
    });

    selectedDay = signal<DailyWorkloadDto | null>(null);

    readonly dayLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

    #buildWeekColumns(data: WorkloadDataDto): WeekColumn[] {
        const workloadMap = new Map<string, DailyWorkloadDto>();
        data.daily_workload.forEach((day) => workloadMap.set(day.date, day));

        const startDate = dayjs(data.start_date);
        const endDate = dayjs(data.end_date);
        const weeks: WeekColumn[] = [];
        let currentWeekStart = startDate.startOf('isoWeek');
        let currentMonth = '';

        while (currentWeekStart.isSameOrBefore(endDate)) {
            const weekDays: (DailyWorkloadDto | null)[] = [];
            const weekNumber = currentWeekStart.isoWeek();
            let monthLabel: string | undefined;

            for (let i = 0; i < 7; i++) {
                const day = currentWeekStart.add(i, 'days');
                const dayStr = day.format('YYYY-MM-DD');
                weekDays.push(day.isBefore(startDate) || day.isAfter(endDate) ? null : (workloadMap.get(dayStr) || null));

                if (i === 0) {
                    const monthName = day.format('MMM YYYY');
                    if (monthName !== currentMonth) {
                        monthLabel = shortMonth(day);
                        currentMonth = monthName;
                    }
                }
            }

            weeks.push({ weekNumber, monthLabel, days: weekDays });
            currentWeekStart = currentWeekStart.add(1, 'week');
        }

        return weeks;
    }

    getColorClass(day: DailyWorkloadDto | null): string {
        if (!day) return 'workload-empty';
        if (day.is_break) return 'workload-break';
        const p = day.total_percent;
        if (p === 0) return 'workload-empty';
        if (p < 50) return 'workload-green';
        if (p < 75) return 'workload-yellow';
        if (p < 100) return 'workload-orange';
        if (p <= 150) return 'workload-red';
        return 'workload-purple';
    }

    isToday = (day: DailyWorkloadDto | null): boolean => day?.date === dayjs().format('YYYY-MM-DD');
    formatDate = (dateStr: string): string => dayjs(dateStr).format('ddd, MMM D, YYYY');
    selectDay = (day: DailyWorkloadDto | null): void => this.selectedDay.set(day);
    getProjectPath = (element: DailyWorkloadElementDto): string => element.project_id ? `/projects/${element.project_id}/milestones` : (element.project_path || '');

    trackByWeek = (_index: number, week: WeekColumn): number => week.weekNumber;
    trackByElement = (_index: number, element: DailyWorkloadElementDto): string => `${element.type}-${element.id}`;
}
