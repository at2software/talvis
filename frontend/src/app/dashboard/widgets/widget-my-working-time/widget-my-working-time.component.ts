import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { StatsService } from '@models/stats.service';
import { EChartsStackedBarOptions } from '@charts/echarts-presets';
import { GlobalService } from '@models/global.service';
import { dayjs } from '@constants/date/dates';
import { Color } from '@constants/Color';
import { WIDGET_SHARED } from '../widgets.shared';
import { DecimalPipe } from '@angular/common';
import type { EChartsOption } from 'echarts';
import type { EChartsType, TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { WorkingTimeDto } from '@models/_core/api-response';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-my-working-time',
    templateUrl: './widget-my-working-time.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, DecimalPipe],
})
export class WidgetMyWorkingTimeComponent extends BaseWidgetComponent {
    #stats = inject(StatsService);
    #global = inject(GlobalService);
    #echartsInstance: EChartsType | undefined;

    defaultOptions = () => ({});

    readonly #workingTime = this.optionsResource(() => this.#stats.showMyWorkingTime());

    readonly workThisWeek = computed(() => Number(this.#workingTime.value()?.work_this_week ?? 0));
    readonly requiredWorkThisWeek = computed(() => Number(this.#workingTime.value()?.required_work_this_week ?? 0));
    readonly averageSoll = computed(() => Number(this.#workingTime.value()?.required_hours ?? this.#global.user?.getHpw() ?? 0));
    readonly average = computed(() => Number(this.#workingTime.value()?.average ?? 0));

    readonly chartOptions = computed<EChartsOption | null>(() => {
        const response: WorkingTimeDto | undefined = this.#workingTime.value();
        if (!response) return null;

        const workInfo = [...(response.workinfo ?? [])];

        const today = dayjs().format('YYYY-MM-DD');
        if (!workInfo.some((e) => e.key === today)) {
            const todayEntry = (response.data ?? []).find((e) => e.key === today);
            if (todayEntry) {
                workInfo.push({ key: today, day: dayjs().format('DD.MM.YYYY'), value: Number(todayEntry.value ?? 0), class: 'work-bar-default', required: 8 });
            }
        }

        const points = workInfo.map((entry) => ({
            x: entry.key ?? dayjs(entry.day, 'DD.MM.YYYY').format('YYYY-MM-DD'),
            value: Number(entry.value ?? 0),
            class: entry.class,
        }));

        const barSeries = [
            { class: 'work-bar-default', name: $localize`:@@i18n.hr.timeOk:time OK`, colorVar: '--color-primary-0' },
            { class: 'work-bar-danger', name: $localize`:@@i18n.hr.timeNotEnought:nicht genug`, colorVar: '--color-danger' },
            { class: 'work-bar-vacation', name: $localize`:@@i18n.hr.timeVacation:vacation`, colorVar: '--color-blue' },
            { class: 'work-bar-sick', name: $localize`:@@i18n.hr.timeSick:sick`, colorVar: '--color-cyan' },
            { class: 'work-bar-holiday', name: $localize`:@@i18n.hr.timeHoliday:public holiday`, colorVar: '--color-dark-grey' },
            { class: 'work-bar-weekend', name: $localize`:@@i18n.hr.timeWeekend:weekend`, colorVar: '--color-grey' },
        ];

        return ({
            ...EChartsStackedBarOptions,
            series: barSeries.map((s) => ({
                name: s.name,
                type: 'bar' as const,
                stack: 'time',
                itemStyle: { color: Color.fromVar(s.colorVar, '').toHexString() },
                data: points.map((p) => [p.x, p.class === s.class ? p.value : 0]),
            })),
            tooltip: {
                ...EChartsStackedBarOptions.tooltip,
                formatter: (params: TopLevelFormatterParams) => {
                    const arr = Array.isArray(params) ? params : [params];
                    if (!arr?.length) return '';
                    const date = dayjs(arr[0].axisValue as string).format('YYYY-MM-DD');
                    let html = `<div style="font-weight: bold; margin-bottom: 8px;">${date}</div>`;
                    arr.forEach((param) => {
                        if ((param.value as number[])[1] > 0) {
                            html += `<div style="display: flex; justify-content: space-between; margin: 4px 0;">
                                <span style="color: ${param.color};">${param.seriesName}</span>
                                <span style="font-family: monospace;">${((param.value as number[])[1]).toPrecision(2)}h</span>
                            </div>`;
                        }
                    });
                    return html;
                },
            },
        } satisfies EChartsOption);
    });

    constructor() {
        super();
        effect(() => {
            const options = this.chartOptions();
            if (options) this.#echartsInstance?.setOption(options, true);
        });
    }

    onChartInit = (ec: EChartsType) => (this.#echartsInstance = ec);
}
