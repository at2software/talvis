import { ChangeDetectionStrategy, Component, effect, inject, input, untracked } from '@angular/core';
import { EchartsCardComponent } from './echarts-card.component';
import { ParamService } from '@models/param/param.service';
import { dayjs } from '@constants/date/dates';
import { ParamChartSeriesDto } from '@models/_core/api-response';


@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: '',
})
export abstract class EchartsParamCardComponent extends EchartsCardComponent {
    abstract updateSeries(result: ParamChartSeriesDto[]): void;

    keyPath = input<string | undefined>(undefined);
    chartData = input<ParamChartSeriesDto[] | undefined>(undefined);
    type = input<string>('bar');
    cluster = input<string>('month');
    offset = input<'none' | 'month' | 'year'>('none');

    #paramService = inject(ParamService);
    #lastResult: ParamChartSeriesDto[] | undefined;

    constructor() {
        super();
        effect(() => {
            this.keyPath();
            this.chartData();
            this.roles();
            this.reload();
        });
        // Series colors are resolved from CSS variables when the series are built; rebuild them on a theme switch.
        effect(() => {
            this.theme();
            untracked(() => this.#lastResult && this.#applySeries(this.#lastResult));
        });
    }

    #applySeries(result: ParamChartSeriesDto[]) {
        this.#lastResult = result;
        this.updateSeries(result);
    }

    seriesLength = () => this.keyPath()?.split(',').length ?? 0;

    reload() {
        if (this.roles()) {
            const requiredRoles = this.roles()!.split('|');
            if (!this.global.user?.hasAnyRole(requiredRoles)) {
                return;
            }
        }
        if (this.chartData()) {
            const dataArray = this.chartData() ?? [];
            return this.#applySeries(dataArray);
        }
        if (this.keyPath()) {
            this.chartOptions.update((o) => ({ ...o, series: [] }));
            this.echartsInstance()?.clear();
            const start = dayjs().startOf('month').subtract(36, 'month');
            this.#paramService.history(this.keyPath()!, start.unix(), 'month').subscribe((_) => this.#applySeries(_));
        }
    }
}
