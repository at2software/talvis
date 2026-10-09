import { ShortPipe } from '@pipes/short.pipe';
import type { EChartsOption, PieSeriesOption } from 'echarts';

declare module 'echarts/types/dist/shared' {
    interface CallbackDataParams {
        axisValue?: string | number;
    }
}

export const ECHARTS_DEFAULT_TOOLTIP_OPTIONS = {
    appendToBody: true,
    className: 'echarts-tooltip',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0,
    textStyle: {},
    extraCssText: '',
};

export const ECHARTS_DONUT_ITEM_STYLE = {
    borderWidth: 0,
};

export const ECHARTS_DONUT_TRACK_COLOR = 'rgba(255, 255, 255, 0.08)';

export const ECHARTS_DONUT_CENTER_TEXT = { fill: '#fff', fontSize: 16, fontWeight: 300 } as const;

export const ECHARTS_DONUT_SERIES = {
    type: 'pie',
    radius: ['62%', '68%'],
    label: { show: false },
    labelLine: { show: false },
    emphasis: { scale: false },
} satisfies PieSeriesOption;

export const ECHARTS_DONUT_SERIES_LABELED = {
    ...ECHARTS_DONUT_SERIES,
    radius: ['50%', '56%'],
} satisfies PieSeriesOption;

export const EChartsSimpleOptions = {
    backgroundColor: 'transparent',
    grid: {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        containLabel: false,
    },
    xAxis: {
        type: 'time',
        show: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
    },
    yAxis: {
        type: 'value',
        show: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
    },
    tooltip: {
        trigger: 'axis',
        ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
    },
    animation: false,
} satisfies EChartsOption;

export const EChartsStackedBarOptions = {
    ...EChartsSimpleOptions,
    xAxis: {
        type: 'time',
        show: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
    },
    tooltip: {
        trigger: 'axis',
        ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
        axisPointer: {
            type: 'shadow',
        },
    },
} satisfies EChartsOption;

export const EChartsDualShadowAreaStyle = {
    filter: 'drop-shadow(0 -1px 2px #09f)',
};

export const EChartsRangeAreaOptions = {
    ...EChartsSimpleOptions,
    xAxis: {
        type: 'time',
        show: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
    },
    yAxis: {
        type: 'value',
        show: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
    },
    tooltip: {
        trigger: 'axis',
        ...ECHARTS_DEFAULT_TOOLTIP_OPTIONS,
        confine: true,
    },
} satisfies EChartsOption;

export const eAnnotateY = (v: number, pipe: ShortPipe) => ({
    yAxis: v,
    name: pipe.transform(v),
    lineStyle: { color: '#ffffff44', type: 'dashed' as const, width: 1 },
    label: { show: true, formatter: pipe.transform(v), position: 'insideEndTop' as const, color: '#ffffff44', fontSize: 10 },
});

export const eAnnotateX = (x: number, label: string) => ({
    xAxis: x,
    name: label,
    lineStyle: { color: '#ffffff80', type: 'solid' as const, width: 1 },
    label: { show: true, formatter: label, position: 'insideStartBottom' as const, color: '#fff', fontSize: 10 },
});
