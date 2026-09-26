import { Dictionary } from '@constants/constants';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { BaseWidgetComponent } from '../base.widget.component';
import { OptionType } from '../widget-options/widget-options.component';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TalvisHttpInterceptor } from '@app/http.interceptor';
import { Color } from '@constants/Color';
import { dayjs } from '@constants/date/dates';

import { WIDGET_SHARED } from '../widgets.shared';
import { EChartsSimpleOptions } from '@charts/echarts-presets';
import type { EChartsOption } from 'echarts';
import type { EChartsType } from 'echarts/types/dist/shared';

@Component({
    changeDetection: ChangeDetectionStrategy.OnPush,
    selector: 'widget-ext',
    templateUrl: './widget-ext.component.html',
    styleUrls: ['./../base.widget.component.scss'],
    imports: [...WIDGET_SHARED],
})
export class WidgetExtComponent extends BaseWidgetComponent {
    #echartsInstance: EChartsType | undefined;
    #http = inject(HttpClient);

    defaultOptions = () => ({
        title: { type: OptionType.String, value: 'External chart', i18n: $localize`:@@i18n.common.title:title` },
        url: { type: OptionType.String, value: '', i18n: $localize`:@@i18n.common.url:URL` },
        headers: { type: OptionType.String, value: '', i18n: $localize`:@@i18n.common.headers:headers` },
    });

    readonly #external = this.optionsResource((options) => {
        const url = String(options['url']);
        const additionalHeaders = String(options['headers'] ?? '').split(' ');
        const headerOptions: Dictionary<string> = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Credentials': 'true',
            'Cache-Control': 'no-cache, no-store, must-revalidate, post-check=0, pre-check=0',
            Pragma: 'no-cache',
            Expires: '0',
        };
        if (additionalHeaders[0]) headerOptions[additionalHeaders[0]] = additionalHeaders[1];

        TalvisHttpInterceptor.add(url, new HttpHeaders(headerOptions));
        return this.#http.get<{ data: Dictionary[] }>(url);
    }, () => !!this.getOptions()['url']?.value);

    readonly #series = computed(() => {
        const rows = this.#external.value()?.data;
        if (!Array.isArray(rows)) return { echartsData: [], count: 0 };

        const xBounds: [string?, string?] = [undefined, undefined];
        for (const _ of rows) {
            const d = _.data as { x: string }[];
            if (xBounds[0] === undefined) xBounds[0] = d[0].x;
            if (xBounds[0]!.localeCompare(d[0].x) > 0) xBounds[0] = d[0].x;
            if (xBounds[1] === undefined) xBounds[1] = d[d.length - 1].x;
            if (xBounds[1]!.localeCompare(d[d.length - 1].x) < 0) xBounds[1] = d[d.length - 1].x;
        }

        const xKeys: Dictionary<{ x: string; y: number }> = {};
        for (let i = dayjs(xBounds[0]); i.isSameOrBefore(dayjs(xBounds[1])); i = i.add(1, 'days')) {
            xKeys[i.format('YYYY-MM-DD')] = { x: i.format('YYYY-MM-DD'), y: 0 };
        }

        let count = 0;
        const echartsData = rows
            .map((_) => {
                if (!('data' in _) || !Array.isArray(_['data'])) return null;
                count += (_['data'] as Dictionary<number>[]).reduce((a, b) => a + (b['y'] as number), 0);
                const keys = structuredClone(xKeys);
                (_['data'] as Dictionary<string | number>[]).forEach((b) => { if (b['x'] in keys) keys[String(b['x'])].y += Number(b['y']); });
                return {
                    name: String(_['name']),
                    type: 'line' as const,
                    stack: 'external',
                    symbol: 'none',
                    areaStyle: { opacity: 0.6 },
                    lineStyle: { width: 2, color: Color.uniqueColorFromString(String(_['name'])) },
                    itemStyle: { color: Color.uniqueColorFromString(String(_['name'])) },
                    data: Object.values(keys).map((point) => [point.x, point.y]),
                    smooth: false,
                };
            })
            .filter((series): series is NonNullable<typeof series> => series !== null);

        return { echartsData, count };
    });

    readonly chartOptions = computed<EChartsOption>(() => ({ ...EChartsSimpleOptions, series: this.#series().echartsData }));
    override value = this.headline(this.#external, () => this.#series().count);

    constructor() {
        super();
        effect(() => this.#echartsInstance?.setOption(this.chartOptions(), true));
    }

    onChartInit = (ec: EChartsType) => (this.#echartsInstance = ec);
}
