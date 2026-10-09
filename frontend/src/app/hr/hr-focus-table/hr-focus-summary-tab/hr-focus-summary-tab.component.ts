import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ActivityTabComponent } from '@app/_activity/activity-tab.component';
import { ScrollbarComponent } from '@app/app/scrollbar/scrollbar.component';
import { AvatarComponent } from '@app/_shards/avatar/avatar.component';
import { User } from '@models/user/user.model';
import { tracked } from '@constants/tracked';
import { ECHARTS_DONUT_ITEM_STYLE, ECHARTS_DONUT_SERIES } from '@charts/echarts-presets';
import { TFocusDay } from '../hr-focus-table.component';

@Component({
    selector: 'hr-focus-summary-tab',
    templateUrl: './hr-focus-summary-tab.component.html',
    imports: [ActivityTabComponent, DecimalPipe, NgxEchartsDirective, ScrollbarComponent, AvatarComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrFocusSummaryTabComponent {
    days = input<TFocusDay[]>();
    readonly user = input.required<User>();
    readonly trackedUser = tracked(this.user);

    readonly stats = computed(() => {
        const days = this.days() ?? [];
        const user = this.trackedUser();
        if (!days.length || !user) return null;

        const sorted = [...days].sort((a, b) => a.moment.diff(b.moment));
        const dateFrom = sorted[0].date;
        const dateTo = sorted[sorted.length - 1].date;
        const hpwArray = user.getHpwArray();

        let paid = 0, unpaid = 0, expected = 0, vacation = 0, sick = 0;
        for (const day of sorted) {
            for (const f of day.foci) {
                if (f.isUnpaid()) unpaid += f.duration;
                else paid += f.duration;
            }
            if (!day.weekend) {
                const contractedHours = hpwArray[day.moment.isoWeekday() - 1] ?? 0;
                if (day.vacation?.isSick()) sick += contractedHours;
                else if (day.vacation?.isVacation()) vacation += contractedHours;
                else expected += contractedHours;
            }
        }

        const totalActual = paid + unpaid;
        const gap = expected - totalActual;
        const paidPercent = totalActual > 0 ? (paid / totalActual) * 100 : 0;

        const donutOptions = {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', formatter: '{b}: {c}h ({d}%)' },
            series: [{
                type: 'pie',
                radius: ECHARTS_DONUT_SERIES.radius,
                avoidLabelOverlap: false,
                selectedMode: 'multiple',
                selectedOffset: 6,
                label: { show: true, position: 'center', color: '#ccc', fontSize: 13, formatter: () => `${totalActual.toFixed(1)}h\n/ ${expected.toFixed(1)}h` },
                emphasis: { label: { fontSize: 14 } },
                data: [
                    { value: parseFloat(paid.toFixed(2)), name: $localize`:@@i18n.hr.paid:Paid`, itemStyle: { color: '#20c997', ...ECHARTS_DONUT_ITEM_STYLE } },
                    { value: parseFloat(unpaid.toFixed(2)), name: $localize`:@@i18n.hr.unpaid:Unpaid`, itemStyle: { color: '#6c757d', ...ECHARTS_DONUT_ITEM_STYLE } },
                    { value: parseFloat(vacation.toFixed(2)), name: $localize`:@@i18n.hr.vacation:Vacation`, selected: vacation > 0, itemStyle: { color: '#0dcaf0', ...ECHARTS_DONUT_ITEM_STYLE } },
                    { value: parseFloat(sick.toFixed(2)), name: $localize`:@@i18n.hr.sick:Sick`, selected: sick > 0, itemStyle: { color: '#ffc107', ...ECHARTS_DONUT_ITEM_STYLE } },
                    ...(gap > 0 ? [{ value: parseFloat(gap.toFixed(2)), name: $localize`:@@i18n.hr.gap:Gap`, selected: true, itemStyle: { color: '#dc3545', ...ECHARTS_DONUT_ITEM_STYLE } }]
                        : gap < 0 ? [{ value: parseFloat((-gap).toFixed(2)), name: $localize`:@@i18n.hr.overtime:Overtime`, selected: true, itemStyle: { color: '#fd7e14', ...ECHARTS_DONUT_ITEM_STYLE } }] : []),
                ],
            }],
        };

        return { dateFrom, dateTo, totalPaid: paid, totalUnpaid: unpaid, totalVacation: vacation, totalSick: sick, totalActual, totalExpected: expected, gap, paidPercent, donutOptions };
    });
}
