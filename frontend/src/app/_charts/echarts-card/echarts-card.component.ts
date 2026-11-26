import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { EChartsSimpleOptions } from '../echarts-presets';
import { NgxEchartsDirective } from 'ngx-echarts';
import { deepMerge } from '@constants/object/deepMerge';
import { GlobalService } from '@models/global.service';
import { Color } from '@constants/Color';
import type { EChartsOption } from 'echarts';
import type { EChartsType, TopLevelFormatterParams } from 'echarts/types/dist/shared';
import { Dictionary } from '@constants/constants';
import { ThemeService } from '@services/theme.service';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'echarts-card',
    templateUrl: './echarts-card.component.html',
    styleUrls: ['./echarts-card.component.scss'],
    imports: [NgxEchartsDirective],
})
export class EchartsCardComponent {
    readonly global = inject(GlobalService);
    protected readonly theme = inject(ThemeService).theme;
    
    value = signal<number>(0);
    cardTitle = input<string>('');
    color = input<string | string[]>('primary');
    options = input<EChartsOption>({});
    suffix = input<string>('');
    roles = input<string | undefined>(undefined);


    chartOptions = signal<EChartsOption>({});
    protected echartsInstance = signal<EChartsType | null>(null);
    protected trend = signal<number>(0);
    #chartInitialized = false;

    protected individualOptions = (): Dictionary => ({});

    constructor() {
        this.chartOptions.set(deepMerge(
            structuredClone(EChartsSimpleOptions),
            {
                series: [],
                tooltip: {
                    confine: true,
                    formatter: (params: TopLevelFormatterParams) => {
                        const arr = [params].flat();
                        if (arr.length === 0) return '';

                        const xValue = arr[0].axisValue;
                        const headerColor = Color.fromVar(this.getColor(0)).toHexString();
                        const headerTextColor = new Color(headerColor).bestBW().toHexString();

                        let html = `<div class="card-header text-center" style="background-color: ${headerColor}; color: ${headerTextColor}; padding: 4px;">${xValue}</div>`;

                        let total = 0;
                        html += '<div class="card-body p-1">';
                        arr.forEach((param, i: number) => {
                            const seriesColor = param.color || this.getColor(i);
                            html += `<div class="f-b p-0 d-flex" style="color: ${seriesColor};">`;
                            html += `<div class="flex-fill px-2">${param.seriesName}</div>`;
                            html += `<div class="px-2 text-end">${param.value}${this.suffix()}</div></div>`;
                            total += Number(param.value) || 0;
                        });
                        html += `<div class="f-b p-0 d-flex"><div class="flex-fill px-2">&sum;</div><div class="px-2 text-end">${total}${this.suffix()}</div></div>`;
                        html += '</div>';
                        return `<div class="arrow_box">${html}</div>`;
                    },
                },
                xAxis: { type: 'time', show: false },
                yAxis: { type: 'value', show: false, min: 0 },
            },
            this.individualOptions(),
            this.options(),
        ));
        this.#chartInitialized = true;

        effect(() => {
            const options = this.options();
            if (this.#chartInitialized) {
                this.chartOptions.update((opts) => Object.assign({}, opts, options));
            }
            window.dispatchEvent(new Event('resize'));
        });
    }

    onChartInit(ec: EChartsType) {
        this.echartsInstance.set(ec);
    }

    protected colorArray = () => [this.color()].flat() as string[];
    protected getColor = (index: number) => {
        const c = this.colorArray();
        return themedColorName(c[index % c.length]);
    };
}

/** `white` series are meant as "foreground"; map them to Bootstrap's emphasis color, which is black in light mode. */
export const themedColorName = (name: string) => (name === 'white' ? 'emphasis-color' : name);
