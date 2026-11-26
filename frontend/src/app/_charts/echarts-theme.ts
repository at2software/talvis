import { computed, inject, type Signal } from '@angular/core';
import { ThemeService, type Theme } from '@services/theme.service';

/**
 * Theme-dependent colors for ECharts. Charts render to canvas, where CSS variables do not resolve, so
 * the values are plain colors. Read them through `injectChartPalette()` (widgets.shared.ts) inside a
 * `computed()` so the chart options rebuild — and the chart re-renders — when the theme changes.
 */
export interface ChartPalette {
    dark: boolean;
    /** Primary text: labels, legends, donut center text. */
    text: string;
    /** Softer text: donut center labels, secondary legends. */
    textSoft: string;
    /** Secondary text: axis labels. */
    textMuted: string;
    axisLine: string;
    splitLine: string;
    /** Subdued remainder ring of donut/radial charts. */
    track: string;
    /** Dashed reference lines (markLine) and their labels. */
    annotation: string;
    annotationStrong: string;
    /** Neutral fill for "nothing"/inactive series parts. */
    neutral: string;
    /** Border around bubbles/points so they separate from the background. */
    itemBorder: string;
    /** Foreground "ink" with alpha: white on dark, near-black on light. Mirrors --tv-ink-rgb. */
    ink: (alpha: number) => string;
}

export const CHART_PALETTES: Record<Theme, ChartPalette> = {
    dark: {
        dark: true,
        text: '#ffffff',
        textSoft: '#cccccc',
        textMuted: '#aaaaaa',
        axisLine: '#444444',
        splitLine: '#333333',
        track: 'rgba(255, 255, 255, 0.08)',
        annotation: '#ffffff44',
        annotationStrong: '#ffffff80',
        neutral: '#333333',
        itemBorder: '#000000',
        ink: (alpha) => `rgba(255, 255, 255, ${alpha})`,
    },
    light: {
        dark: false,
        text: '#1b2727',
        textSoft: '#354343',
        textMuted: '#566464',
        axisLine: '#b8c4c4',
        splitLine: '#dde4e4',
        track: 'rgba(0, 0, 0, 0.08)',
        annotation: '#1b272766',
        annotationStrong: '#1b2727a0',
        neutral: '#d0d8d8',
        itemBorder: '#ffffff',
        ink: (alpha) => `rgba(27, 39, 39, ${alpha})`,
    },
};

export const chartPalette = (theme: Theme): ChartPalette => CHART_PALETTES[theme];

/** Palette of the active theme. Call in an injection context; read it inside `computed()`. */
export const injectChartPalette = (): Signal<ChartPalette> => {
    const theme = inject(ThemeService).theme;
    return computed(() => chartPalette(theme()));
};

/** Chart options that are rebuilt whenever the theme changes, so ECharts re-renders with the new colors. */
export const themedChartOptions = <T>(build: (palette: ChartPalette) => T): Signal<T> => {
    const palette = injectChartPalette();
    return computed(() => build(palette()));
};
