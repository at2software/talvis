import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { UptimeMonitor } from '@models/uptime/uptime-monitor.model';
import { UptimeMonitorService } from '@models/uptime/uptime-monitor.service';
import { WIDGET_SHARED } from '../widgets.shared';
import { EChartsRangeAreaOptions } from '@charts/echarts-presets';
import { dayjs } from '@constants/date/dates';
import { ValueUnitComponent } from '@shards/value-unit/value-unit.component';
import { SpinnerComponent } from '@shards/spinner/spinner.component';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-uptime-monitors',
    templateUrl: './widget-uptime-monitors.component.html',
    styleUrls: ['./widget-uptime-monitors.component.scss', './../base.widget.component.scss'],
    imports: [ValueUnitComponent, ...WIDGET_SHARED, SpinnerComponent],
})
export class WidgetUptimeMonitorsComponent extends BaseWidgetComponent {
    #service = inject(UptimeMonitorService);

    readonly #monitors = this.optionsResource(() => this.#service.index());
    readonly monitors = computed<UptimeMonitor[]>(() => this.#monitors.value() ?? []);
    readonly loaded = computed(() => this.#monitors.hasValue() || this.#monitors.status() === 'error');
    override value = this.headline(this.#monitors, () => Math.round((this.monitors().filter((m) => m.last_status === 'up').length / (this.monitors().length || 1)) * 100));

    readonly chartOptions = computed<any>(() => {
        const now = dayjs();
        const last30Days = Array.from({ length: 30 }, (_, i) => ({
            date: now.subtract(29 - i, 'days').format('YYYY-MM-DD'),
            upCount: 0,
            total: 0,
        }));

        this.monitors().forEach((monitor) => {
            last30Days.forEach((day) => {
                day.total++;
                if (monitor.last_status === 'up') day.upCount++;
            });
        });

        return {
            ...EChartsRangeAreaOptions,
            chart: { height: 120 },
            series: [{
                type: 'line',
                data: last30Days.map((day) => [day.date, day.total > 0 ? Math.round((day.upCount / day.total) * 100) : 100]),
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: '#28a745' },
                areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(40, 167, 69, 0.3)' }, { offset: 1, color: 'rgba(40, 167, 69, 0.05)' }] } },
            }],
        };
    });
}
